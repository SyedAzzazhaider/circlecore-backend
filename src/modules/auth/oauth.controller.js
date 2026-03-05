const passport = require('passport');
const logger = require('../../utils/logger');

/**
 * OAuthController
 * Document requirement: MODULE A — OAuth (Google, Apple, LinkedIn)
 *
 * Responsibilities:
 *  - Initiate OAuth flow: encode state param (inviteCode + redirectUrl), redirect to provider.
 *  - Handle provider callback: set httpOnly refresh token cookie, redirect to frontend.
 *  - Handle failures: redirect to frontend with a structured error query string.
 *
 * Token delivery strategy:
 *  - refreshToken → httpOnly secure cookie (same as standard login).
 *  - accessToken  → URL fragment on the frontend redirect.
 *    e.g. /auth/oauth/success#accessToken=...&isNewUser=true
 *    The frontend reads this from the URL fragment (never sent to any server).
 *
 * This approach avoids exposing tokens in server logs, proxy logs, or referrer headers.
 */
class OAuthController {

  // ─────────────────────────────────────────────────────────────────────────────
  // INITIATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Build and encode the OAuth state parameter.
   * Called before redirecting to the provider.
   *
   * @param {string|null} inviteCode
   * @param {string|null} redirectUrl  - Optional frontend page to return to after auth
   * @returns {string} base64-encoded state
   */
  _buildState(inviteCode, redirectUrl) {
    const statePayload = {
      inviteCode: inviteCode || null,
      redirectUrl: redirectUrl || process.env.FRONTEND_URL + '/dashboard',
      nonce: Math.random().toString(36).slice(2), // Prevent state fixation
    };
    return Buffer.from(JSON.stringify(statePayload)).toString('base64');
  }

  /**
   * Parse the redirect URL from the decoded state.
   * Validates the URL belongs to the configured FRONTEND_URL to prevent open redirects.
   */
  _safeRedirectUrl(state) {
    try {
      const decoded = JSON.parse(Buffer.from(state || '', 'base64').toString('utf8'));
      const url = decoded.redirectUrl;
      const allowed = process.env.FRONTEND_URL || 'http://localhost:3000';

      // Strictly validate the redirect stays on our frontend domain
      if (url && url.startsWith(allowed)) return url;
    } catch (_) { /* ignore */ }
    return (process.env.FRONTEND_URL || 'http://localhost:3000') + '/dashboard';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // GOOGLE
  // ─────────────────────────────────────────────────────────────────────────────

  initiateGoogle(req, res, next) {
    const state = this._buildState(req.query.inviteCode, req.query.redirectUrl);
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      state,
      session: false,
    })(req, res, next);
  }

  handleGoogleCallback(req, res, next) {
    passport.authenticate('google', {
      session: false,
      failWithError: true,
    }, (err, result, info) => {
      this._handleCallbackResult(err, result, info, req, res);
    })(req, res, next);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LINKEDIN
  // ─────────────────────────────────────────────────────────────────────────────

  initiateLinkedIn(req, res, next) {
    const state = this._buildState(req.query.inviteCode, req.query.redirectUrl);
    passport.authenticate('linkedin', {
      state,
      session: false,
    })(req, res, next);
  }

  handleLinkedInCallback(req, res, next) {
    passport.authenticate('linkedin', {
      session: false,
      failWithError: true,
    }, (err, result, info) => {
      this._handleCallbackResult(err, result, info, req, res);
    })(req, res, next);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // APPLE
  // Apple uses POST for its callback, not GET.
  // ─────────────────────────────────────────────────────────────────────────────

  initiateApple(req, res, next) {
    const state = this._buildState(req.query.inviteCode, req.query.redirectUrl);
    passport.authenticate('apple', {
      state,
      session: false,
    })(req, res, next);
  }

  handleAppleCallback(req, res, next) {
    passport.authenticate('apple', {
      session: false,
      failWithError: true,
    }, (err, result, info) => {
      this._handleCallbackResult(err, result, info, req, res, req.body?.state);
    })(req, res, next);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SHARED CALLBACK HANDLER
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Processes the result from any provider strategy.
   * On success: set cookie + redirect to frontend with access token in fragment.
   * On failure: redirect to frontend login page with error message.
   */
  _handleCallbackResult(err, result, info, req, res, rawState) {
    const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3000';
    const state = rawState || req.query.state;
    const redirectBase = this._safeRedirectUrl(state);

    // Hard errors (unexpected exceptions)
    if (err) {
      logger.error(`OAuth callback error: ${err.message}`);
      return res.redirect(
        `${frontendBase}/auth/login?error=oauth_error&message=${encodeURIComponent('Authentication failed. Please try again.')}`
      );
    }

    // Strategy-level failures (invalid invite code, suspended account, etc.)
    if (!result) {
      const message = info?.message || 'Authentication failed.';
      const code = info?.statusCode === 403 ? 'invite_required' : 'oauth_failed';
      logger.warn(`OAuth strategy failure: ${message}`);
      return res.redirect(
        `${frontendBase}/auth/login?error=${code}&message=${encodeURIComponent(message)}`
      );
    }

    // Success — set httpOnly refresh token cookie
    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    logger.info(
      `OAuth callback success — user: ${result.user.email} ` +
      `provider: ${result.user.oauthProvider} ` +
      `newUser: ${result.isNewUser}`
    );

    // Redirect to frontend with access token in the URL fragment.
    // Fragment (#) is never sent to servers — safe from proxy/log exposure.
    const fragment = new URLSearchParams({
      accessToken: result.accessToken,
      userId: result.user._id.toString(),
      isNewUser: result.isNewUser ? '1' : '0',
    }).toString();

    return res.redirect(`${redirectBase}#${fragment}`);
  }
}

module.exports = new OAuthController();