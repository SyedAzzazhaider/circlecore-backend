const express = require('express');
const router = express.Router();
const oauthController = require('./oauth.controller');

/**
 * OAuth Routes — MODULE A
 * Document requirement: "OAuth (Google, Apple, LinkedIn)"
 *
 * Route structure:
 *   GET  /api/auth/oauth/google               — initiate Google OAuth
 *   GET  /api/auth/oauth/google/callback      — Google callback
 *   GET  /api/auth/oauth/linkedin             — initiate LinkedIn OAuth
 *   GET  /api/auth/oauth/linkedin/callback    — LinkedIn callback
 *   GET  /api/auth/oauth/apple                — initiate Apple OAuth
 *   POST /api/auth/oauth/apple/callback       — Apple callback (Apple uses POST)
 *
 * Invite code flow:
 *   Frontend passes invite code as a query param on the initiate route:
 *   GET /api/auth/oauth/google?inviteCode=ABCDEF123
 *
 *   The controller encodes the invite code into the OAuth `state` parameter.
 *   On callback, the state is decoded and the invite code is retrieved.
 *   This ensures the invite code survives the provider redirect round-trip
 *   without using server-side sessions.
 *
 * No authentication middleware on these routes — they are public entry points.
 * No rate limiter here — Google/Apple/LinkedIn impose their own rate controls.
 */

// ─── GOOGLE ───────────────────────────────────────────────────────────────────
router.get('/google',
  (req, res, next) => oauthController.initiateGoogle(req, res, next)
);

router.get('/google/callback',
  (req, res, next) => oauthController.handleGoogleCallback(req, res, next)
);

// ─── LINKEDIN ─────────────────────────────────────────────────────────────────
router.get('/linkedin',
  (req, res, next) => oauthController.initiateLinkedIn(req, res, next)
);

router.get('/linkedin/callback',
  (req, res, next) => oauthController.handleLinkedInCallback(req, res, next)
);

// ─── APPLE ────────────────────────────────────────────────────────────────────
// Apple redirects with a POST to the callback URL — express.urlencoded must be
// enabled for req.body to be populated. This is already configured in app.js.
router.get('/apple',
  (req, res, next) => oauthController.initiateApple(req, res, next)
);

router.post('/apple/callback',
  (req, res, next) => oauthController.handleAppleCallback(req, res, next)
);

module.exports = router;