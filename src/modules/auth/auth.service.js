const User      = require('./auth.model');
const analytics = require('../../services/analytics.service');
const crypto    = require('crypto');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../../utils/jwt');
const { generateTwoFactorTempToken } = require('../../utils/jwt');
const logger = require('../../utils/logger');

/**
 * Auth Service — MODULE A
 */
class AuthService {

  async register({ name, email, password, inviteCode }) {
    const InviteCode = require('./inviteCode.model');
    const Profile    = require('../users/profile.model');
    const { sendVerificationEmail } = require('../../utils/email');

    const invite = await InviteCode.findOne({ code: inviteCode.toUpperCase() });
    if (!invite || !invite.isValid()) {
      throw Object.assign(new Error('Invalid or expired invite code'), { statusCode: 400 });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      throw Object.assign(new Error('Email already registered'), { statusCode: 409 });
    }

    const verificationToken   = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await User.create({
      name,
      email:                    email.toLowerCase(),
      password,
      inviteCodeUsed:           invite._id,
      emailVerificationToken:   verificationToken,
      emailVerificationExpires: verificationExpires,
    });

    invite.useCount += 1;
    invite.usedBy    = user._id;
    if (invite.useCount >= invite.maxUses) invite.isUsed = true;
    await invite.save();

    await Profile.create({ userId: user._id });

    try {
      await sendVerificationEmail(user.email, user.name, verificationToken);
    } catch (e) {
      logger.warn('Verification email failed (non-fatal): ' + e.message);
    }

    analytics.userSignedUp(user._id, {
      email: user.email,
      name:  user.name,
      role:  user.role,
    });

    logger.info('User registered: ' + user.email);
    return { message: 'Registration successful. Please check your email to verify your account.' };
  }

  async verifyEmail(token) {
    const user = await User.findOne({
      emailVerificationToken:   token,
      emailVerificationExpires: { $gt: new Date() },
    }).select('+emailVerificationToken +emailVerificationExpires');

    if (!user) {
      throw Object.assign(new Error('Invalid or expired verification token'), { statusCode: 400 });
    }

    user.isEmailVerified          = true;
    user.emailVerificationToken   = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    logger.info('Email verified for user: ' + user.email);
    return { message: 'Email verified successfully. You can now log in.' };
  }

  async login({ email, password }) {
    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+password +refreshTokens +loginAttempts +lockUntil +twoFactorEnabled');

    if (!user) {
      throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
    }
    if (user.isLocked) {
      throw Object.assign(
        new Error('Account locked due to too many failed attempts. Try again in 2 hours.'),
        { statusCode: 423 }
      );
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await user.incrementLoginAttempts();
      throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
    }

    if (!user.isEmailVerified) {
      throw Object.assign(new Error('Please verify your email before logging in'), { statusCode: 401 });
    }
    if (user.isSuspended) {
      throw Object.assign(new Error('Account suspended. Contact support.'), { statusCode: 403 });
    }

    if (user.twoFactorEnabled) {
      const twoFactorTempToken = generateTwoFactorTempToken(user._id);
      return { requiresTwoFactor: true, twoFactorTempToken };
    }

    const payload      = { userId: user._id, email: user.email, role: user.role };
    const accessToken  = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    const tokens = user.refreshTokens || [];
    tokens.push(refreshToken);

    await User.findByIdAndUpdate(user._id, {
      refreshTokens: tokens,
      lastLogin:     new Date(),
      loginAttempts: 0,
    });

    analytics.userLoggedIn(user._id, { email: user.email, role: user.role });

    logger.info('User logged in: ' + user.email);
    return {
      accessToken,
      refreshToken,
      user: {
        _id:       user._id,
        name:      user.name,
        email:     user.email,
        role:      user.role,
        profileId: user.profileId,
      },
    };
  }

  async refreshToken(token) {
    const decoded = verifyRefreshToken(token);
    const user    = await User.findById(decoded.userId).select('+refreshTokens');

    if (!user) {
      throw Object.assign(new Error('User not found'), { statusCode: 401 });
    }

    const tokenIndex = user.refreshTokens.indexOf(token);
    if (tokenIndex === -1) {
      throw Object.assign(new Error('Invalid refresh token'), { statusCode: 401 });
    }

    const payload         = { userId: user._id, email: user.email, role: user.role };
    const newAccessToken  = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken(payload);

    user.refreshTokens[tokenIndex] = newRefreshToken;
    await user.save();

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(userId, refreshToken) {
    await User.findByIdAndUpdate(userId, {
      $pull:          { refreshTokens: refreshToken },
      deviceToken:    null,
      devicePlatform: null,
    });
    return { message: 'Logged out successfully' };
  }

  async forgotPassword(email) {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return { message: 'If that email is registered, you will receive a reset link.' };
    }

    const resetToken   = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000);

    await User.findByIdAndUpdate(user._id, {
      passwordResetToken:   resetToken,
      passwordResetExpires: resetExpires,
    });

    const { sendPasswordResetEmail } = require('../../utils/email');
    await sendPasswordResetEmail(user.email, user.name, resetToken);

    return { message: 'If that email is registered, you will receive a reset link.' };
  }

  async resetPassword(token, newPassword) {
    const user = await User.findOne({
      passwordResetToken:   token,
      passwordResetExpires: { $gt: new Date() },
    }).select('+passwordResetToken +passwordResetExpires +refreshTokens');

    if (!user) {
      throw Object.assign(new Error('Invalid or expired reset token'), { statusCode: 400 });
    }

    user.password             = newPassword;
    user.passwordResetToken   = undefined;
    user.passwordResetExpires = undefined;
    user.refreshTokens        = [];
    await user.save();

    return { message: 'Password reset successfully. Please log in with your new password.' };
  }

  async generateInviteCode(userId, { communityId, maxUses } = {}) {
    const InviteCode = require('./inviteCode.model');
    const invite = await InviteCode.create({
      createdBy:   userId,
      communityId: communityId || null,
      maxUses:     maxUses || 1,
    });
    logger.info('Invite code generated by user: ' + userId + ' code: ' + invite.code);
    return invite;
  }

  async redeemInviteCode(code) {
    const InviteCode = require('./inviteCode.model');
    const invite = await InviteCode.findOne({ code: code.toUpperCase() });
    if (!invite) {
      throw Object.assign(new Error('Invite code not found'), { statusCode: 404 });
    }
    if (!invite.isValid()) {
      throw Object.assign(new Error('Invite code is expired or already used'), { statusCode: 400 });
    }
    return {
      message:     'Invite code is valid',
      communityId: invite.communityId,
      expiresAt:   invite.expiresAt,
    };
  }
}

module.exports = new AuthService();