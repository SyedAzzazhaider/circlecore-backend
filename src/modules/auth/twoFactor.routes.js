const express = require('express');
const router = express.Router();
const twoFactorController = require('./twoFactor.controller');
const { authenticate } = require('../../middleware/authenticate');
const { authLimiter } = require('../../middleware/rateLimiter');

/**
 * 2FA Routes — MODULE A
 * Document requirement: "Two-Factor Auth (optional)"
 *
 * Mounted at: /api/auth/2fa  (via auth.routes.js → router.use('/2fa', ...))
 *
 * Route map:
 * ┌──────────────────────────────────┬────────────┬──────────────────────────────────────┐
 * │ Route                            │ Auth       │ Purpose                              │
 * ├──────────────────────────────────┼────────────┼──────────────────────────────────────┤
 * │ POST /api/auth/2fa/setup         │ Protected  │ Generate secret + QR code            │
 * │ POST /api/auth/2fa/enable        │ Protected  │ Confirm + activate 2FA               │
 * │ POST /api/auth/2fa/verify-login  │ Public     │ Complete login after 2FA gate        │
 * │ DELETE /api/auth/2fa/disable     │ Protected  │ Turn off 2FA (password + TOTP)       │
 * └──────────────────────────────────┴────────────┴──────────────────────────────────────┘
 *
 * Security:
 * - verify-login is rate-limited with authLimiter — prevents TOTP brute-force.
 * - setup/enable/disable require authenticate middleware — JWT must be valid.
 */

// ─── PROTECTED ────────────────────────────────────────────────────────────────

// Initiate 2FA setup — generates TOTP secret and QR code
router.post('/setup',
  authenticate,
  twoFactorController.setup
);

// Enable 2FA — user confirms setup with their first TOTP code
// Returns 8 single-use backup codes (shown ONCE only)
router.post('/enable',
  authenticate,
  twoFactorController.enable
);

// Disable 2FA — requires password + valid TOTP code
router.delete('/disable',
  authenticate,
  twoFactorController.disable
);

// ─── PUBLIC (rate-limited) ────────────────────────────────────────────────────

// Complete login — called after login returns { requiresTwoFactor: true }
// Accepts TOTP code or single-use backup code
// Rate-limited to prevent brute-force on the 6-digit TOTP window
router.post('/verify-login',
  authLimiter,
  twoFactorController.verifyLogin
);

module.exports = router;