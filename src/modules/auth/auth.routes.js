const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { authenticate } = require('../../middleware/authenticate');
const validate = require('../../middleware/validate');
const { verifyRecaptcha } = require('../../middleware/recaptcha');
const { authLimiter } = require('../../middleware/rateLimiter');
const twoFactorRoutes = require('./twoFactor.routes');
const {
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
} = require('./auth.validators');

/**
 * Auth Routes — MODULE A
 * Document: Authentication & Access
 *
 * Security notes:
 * - reCAPTCHA applied to register/signup and login
 * - authLimiter on forgot-password, reset-password, refresh-token (BUG 1 FIX)
 */

// ─── PUBLIC ROUTES ────────────────────────────────────────────────────────────

// Registration — Document Section 9 API Contract: POST /auth/signup
// /register alias added for backward compatibility with existing tests and clients.
// Both routes point to the identical handler and middleware stack.
router.post(
  '/signup',
  verifyRecaptcha,
  registerValidator,
  validate,
  authController.register
);

router.post(
  '/register',
  verifyRecaptcha,
  registerValidator,
  validate,
  authController.register
);

router.post(
  '/login',
  verifyRecaptcha,
  loginValidator,
  validate,
  authController.login
);

// Email verification — no limiter needed (token is single-use, time-limited)
router.get('/verify-email/:token', authController.verifyEmail);

// Password reset — authLimiter applied (BUG 1 FIX — was missing)
router.post(
  '/forgot-password',
  authLimiter,
  forgotPasswordValidator,
  validate,
  authController.forgotPassword
);

router.post(
  '/reset-password/:token',
  authLimiter,
  resetPasswordValidator,
  validate,
  authController.resetPassword
);

// Token refresh — authLimiter applied (BUG 1 FIX — was missing)
router.post(
  '/refresh-token',
  authLimiter,
  authController.refreshToken
);

// ─── PROTECTED ROUTES ─────────────────────────────────────────────────────────

router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getMe);
router.post('/invite-code', authenticate, authController.generateInviteCode);

// ─── INVITE REDEEM ────────────────────────────────────────────────────────────
// Document Section 9 API Contract: POST /invites/redeem
// Public — rate-limited to prevent invite code enumeration.
router.post('/invites/redeem', authLimiter, authController.redeemInviteCode);

// ─── TWO-FACTOR AUTHENTICATION ────────────────────────────────────────────────
// All 2FA routes live at /api/auth/2fa/*
router.use('/2fa', twoFactorRoutes);

module.exports = router;