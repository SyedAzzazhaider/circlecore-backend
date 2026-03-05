const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LinkedInStrategy = require('passport-linkedin-oauth2').Strategy;
const AppleStrategy = require('passport-apple');
const oauthService = require('../modules/auth/oauth.service');
const logger = require('../utils/logger');

/**
 * Passport Configuration
 * Document requirement: MODULE A — OAuth (Google, Apple, LinkedIn)
 *
 * Architecture notes:
 * - Passport is used ONLY as the OAuth protocol handler (token exchange, profile fetch).
 * - Session serialisation is intentionally disabled — we are stateless JWT-based.
 * - All business logic (user find/create, invite validation) lives in OAuthService.
 * - The invite code travels through the OAuth `state` parameter so it survives
 *   the provider redirect round-trip.
 *
 * State param encoding:
 *   state = Buffer.from(JSON.stringify({ inviteCode, redirectUrl })).toString('base64')
 */

// ─── Disable session serialisation (stateless JWT architecture) ───────────────
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE STRATEGY
// https://console.cloud.google.com — requires OAuth 2.0 credentials
// Scopes: profile, email
// ─────────────────────────────────────────────────────────────────────────────
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL ||
          `${process.env.API_BASE_URL || 'http://localhost:5000'}/api/auth/oauth/google/callback`,
        passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          const inviteCode = _extractInviteCodeFromState(req.query.state);

          const profileData = {
            email: profile.emails?.[0]?.value || null,
            name: profile.displayName || null,
            avatar: profile.photos?.[0]?.value || null,
          };

          const result = await oauthService.findOrCreateUser(
            'google',
            profile.id,
            profileData,
            inviteCode
          );

          done(null, result);
        } catch (error) {
          logger.warn(`Google OAuth error: ${error.message}`);
          done(null, false, { message: error.message, statusCode: error.statusCode || 500 });
        }
      }
    )
  );
  logger.info('Passport: Google OAuth strategy registered');
} else {
  logger.warn('Passport: GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — Google OAuth disabled');
}

// ─────────────────────────────────────────────────────────────────────────────
// LINKEDIN STRATEGY
// https://www.linkedin.com/developers — requires OAuth 2.0 app
// Scopes: r_emailaddress, r_liteprofile
// ─────────────────────────────────────────────────────────────────────────────
if (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET) {
  passport.use(
    new LinkedInStrategy(
      {
        clientID: process.env.LINKEDIN_CLIENT_ID,
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
        callbackURL: process.env.LINKEDIN_CALLBACK_URL ||
          `${process.env.API_BASE_URL || 'http://localhost:5000'}/api/auth/oauth/linkedin/callback`,
        scope: ['r_emailaddress', 'r_liteprofile'],
        passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, profile, done) => {
        try {
          const inviteCode = _extractInviteCodeFromState(req.query.state);

          const profileData = {
            email: profile.emails?.[0]?.value || null,
            name: profile.displayName || null,
            avatar: profile.photos?.[0]?.value || null,
          };

          const result = await oauthService.findOrCreateUser(
            'linkedin',
            profile.id,
            profileData,
            inviteCode
          );

          done(null, result);
        } catch (error) {
          logger.warn(`LinkedIn OAuth error: ${error.message}`);
          done(null, false, { message: error.message, statusCode: error.statusCode || 500 });
        }
      }
    )
  );
  logger.info('Passport: LinkedIn OAuth strategy registered');
} else {
  logger.warn('Passport: LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET not set — LinkedIn OAuth disabled');
}

// ─────────────────────────────────────────────────────────────────────────────
// APPLE STRATEGY
// https://developer.apple.com — requires App ID with Sign In with Apple capability
// Notes:
//  - Apple requires a paid Apple Developer account.
//  - Apple only sends email on the FIRST login — store it immediately.
//  - Apple callback is a POST (not GET) — handled in routes accordingly.
//  - privateKeyString can be loaded from env (base64 encoded) or a file path.
// ─────────────────────────────────────────────────────────────────────────────
if (
  process.env.APPLE_CLIENT_ID &&
  process.env.APPLE_TEAM_ID &&
  process.env.APPLE_KEY_ID &&
  (process.env.APPLE_PRIVATE_KEY || process.env.APPLE_PRIVATE_KEY_PATH)
) {
  // Support both base64-encoded env var and file path
  const applePrivateKey = process.env.APPLE_PRIVATE_KEY
    ? Buffer.from(process.env.APPLE_PRIVATE_KEY, 'base64').toString('utf8')
    : require('fs').readFileSync(process.env.APPLE_PRIVATE_KEY_PATH, 'utf8');

  passport.use(
    new AppleStrategy(
      {
        clientID: process.env.APPLE_CLIENT_ID,
        teamID: process.env.APPLE_TEAM_ID,
        keyID: process.env.APPLE_KEY_ID,
        privateKeyString: applePrivateKey,
        callbackURL: process.env.APPLE_CALLBACK_URL ||
          `${process.env.API_BASE_URL || 'http://localhost:5000'}/api/auth/oauth/apple/callback`,
        passReqToCallback: true,
      },
      async (req, accessToken, refreshToken, idToken, profile, done) => {
        try {
          // Apple sends user name/email only on the FIRST authentication.
          // On subsequent logins, these fields are absent — rely on the sub (providerId).
          const inviteCode = _extractInviteCodeFromState(req.body?.state);

          // Apple provides user info in req.body.user on first login (JSON string)
          let appleUser = {};
          if (req.body?.user) {
            try {
              appleUser = typeof req.body.user === 'string'
                ? JSON.parse(req.body.user)
                : req.body.user;
            } catch (_) { /* ignore parse errors */ }
          }

          const profileData = {
            email: profile?.email || appleUser?.email || idToken?.email || null,
            name: appleUser?.name
              ? `${appleUser.name.firstName || ''} ${appleUser.name.lastName || ''}`.trim()
              : null,
            avatar: null, // Apple does not provide a profile photo
          };

          const result = await oauthService.findOrCreateUser(
            'apple',
            profile.id || idToken.sub,
            profileData,
            inviteCode
          );

          done(null, result);
        } catch (error) {
          logger.warn(`Apple OAuth error: ${error.message}`);
          done(null, false, { message: error.message, statusCode: error.statusCode || 500 });
        }
      }
    )
  );
  logger.info('Passport: Apple OAuth strategy registered');
} else {
  logger.warn(
    'Passport: Apple OAuth credentials not fully configured — Apple OAuth disabled. ' +
    'Required: APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (or APPLE_PRIVATE_KEY_PATH)'
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Decode the OAuth state parameter to extract the invite code.
 * State is base64(JSON.stringify({ inviteCode, redirectUrl }))
 * Safe to call with null/undefined — returns null on any parse failure.
 */
function _extractInviteCodeFromState(state) {
  if (!state) return null;
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
    return decoded.inviteCode || null;
  } catch (_) {
    return null;
  }
}

module.exports = passport;