const crypto = require('crypto');
const User = require('./auth.model');
const InviteCode = require('./inviteCode.model');
const Profile = require('../users/profile.model');
const {
  generateAccessToken,
  generateRefreshToken,
} = require('../../utils/jwt');
const logger = require('../../utils/logger');

/**
 * OAuthService
 * Document requirement: MODULE A — OAuth (Google, Apple, LinkedIn)
 *
 * Responsibilities:
 *  - Find an existing user by OAuth provider + provider ID.
 *  - If user does not exist: validate invite code, create account + profile.
 *  - If user does not exist and no invite code provided: throw 403 (invite-only platform).
 *  - Issue JWT access + refresh tokens identical to the standard login flow.
 *
 * Invite code policy:
 *  - New OAuth users MUST supply a valid invite code (passed via OAuth state param).
 *  - Returning OAuth users (oauthId already in DB) bypass invite code validation.
 */
class OAuthService {

  /**
   * Core method called by every Passport strategy callback.
   *
   * @param {string} provider      - 'google' | 'apple' | 'linkedin'
   * @param {string} providerId    - Unique ID from the provider
   * @param {object} profileData   - Normalised profile fields from the strategy
   * @param {string} inviteCode    - Invite code from OAuth state (required for new users)
   * @returns {{ accessToken, refreshToken, user, isNewUser }}
   */
  async findOrCreateUser(provider, providerId, profileData, inviteCode) {
    const { email, name, avatar } = profileData;

    // ── 1. Returning user — same provider, same provider ID ──────────────────
    let user = await User.findOne({
      oauthProvider: provider,
      oauthId: providerId,
    }).select('+refreshTokens');

    if (user) {
      if (user.isSuspended) {
        throw Object.assign(
          new Error('Account suspended. Contact support.'),
          { statusCode: 403 }
        );
      }
      return this._issueTokensForUser(user, false);
    }

    // ── 2. Email already registered with password — link provider ────────────
    if (email) {
      const existingEmailUser = await User.findOne({
        email: email.toLowerCase(),
      }).select('+refreshTokens');

      if (existingEmailUser) {
        // Link the OAuth provider to the existing account silently
        existingEmailUser.oauthProvider = provider;
        existingEmailUser.oauthId = providerId;
        if (!existingEmailUser.avatar && avatar) {
          // Don't touch profile avatar here — done below if needed
        }
        await existingEmailUser.save();
        return this._issueTokensForUser(existingEmailUser, false);
      }
    }

    // ── 3. New user — invite code is mandatory (invite-only platform) ─────────
    if (!inviteCode) {
      throw Object.assign(
        new Error(
          'An invite code is required to join CircleCore. ' +
          'Please obtain an invite code before signing in with ' +
          provider.charAt(0).toUpperCase() + provider.slice(1) + '.'
        ),
        { statusCode: 403 }
      );
    }

    const invite = await InviteCode.findOne({
      code: inviteCode.toUpperCase(),
    });
    if (!invite) {
      throw Object.assign(new Error('Invalid invite code.'), {
        statusCode: 400,
      });
    }
    if (!invite.isValid()) {
      throw Object.assign(
        new Error('Invite code is expired or already used.'),
        { statusCode: 400 }
      );
    }

    // ── 4. Create the new user ────────────────────────────────────────────────
    const newUser = await User.create({
      name: name || 'CircleCore Member',
      email: email ? email.toLowerCase() : this._generatePlaceholderEmail(provider, providerId),
      // OAuth users have no password — set a random unusable hash
      password: crypto.randomBytes(32).toString('hex'),
      oauthProvider: provider,
      oauthId: providerId,
      isEmailVerified: true, // Provider has already verified the email
      inviteCodeUsed: invite._id,
    });

    // Create linked profile
    const profile = await Profile.create({
      userId: newUser._id,
      avatar: avatar || null,
    });

    await User.findByIdAndUpdate(newUser._id, { profileId: profile._id });

    // Consume the invite code
    invite.useCount += 1;
    invite.usedBy = newUser._id;
    if (invite.useCount >= invite.maxUses) invite.isUsed = true;
    await invite.save();

    logger.info(
      `New OAuth user registered via ${provider}: ${newUser.email}`
    );

    // Re-fetch with refreshTokens selected for token issuance
    const freshUser = await User.findById(newUser._id).select('+refreshTokens');
    return this._issueTokensForUser(freshUser, true);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Generate JWT tokens and persist refresh token — mirrors standard login.
   */
  async _issueTokensForUser(user, isNewUser) {
    const payload = {
      userId: user._id,
      role: user.role,
      email: user.email,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    const tokens = user.refreshTokens || [];
    tokens.push(refreshToken);
    if (tokens.length > 5) tokens.shift(); // Cap at 5 concurrent sessions

    await User.findByIdAndUpdate(user._id, {
      refreshTokens: tokens,
      lastLogin: new Date(),
    });

    logger.info(`OAuth login successful for user: ${user.email}`);

    return {
      accessToken,
      refreshToken,
      isNewUser,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profileId: user.profileId,
        oauthProvider: user.oauthProvider,
      },
    };
  }

  /**
   * Apple can withhold email on subsequent logins — generate a stable placeholder.
   * This is a known Apple OAuth constraint.
   */
  _generatePlaceholderEmail(provider, providerId) {
    const hash = crypto
      .createHash('sha256')
      .update(provider + ':' + providerId)
      .digest('hex')
      .slice(0, 12);
    return `${provider}_${hash}@oauth.circlecore.internal`;
  }
}

module.exports = new OAuthService();