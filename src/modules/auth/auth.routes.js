const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { authenticate } = require('../../middleware/authenticate');
const validate = require('../../middleware/validate');
const { verifyRecaptcha } = require('../../middleware/recaptcha');
const { authLimiter } = require('../../middleware/rateLimiter'); // BUG 1 FIX — re-added missing import
const twoFactorRoutes = require('./twoFactor.routes');           // 2FA sub-router
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
 * - reCAPTCHA applied to register and login (public entry points)
 * - authLimiter applied to all sensitive public endpoints:
 *     forgot-password  → brute-force / enumeration attack surface
 *     reset-password   → token replay / brute-force surface
 *     refresh-token    → token cycling abuse surface
 * - authLimiter was removed during reCAPTCHA update — now restored (BUG 1)
 */

// ─── PUBLIC ROUTES ────────────────────────────────────────────────────────────

// Registration & login — reCAPTCHA + rate limited
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

// Password reset — CRITICAL: authLimiter restored (BUG 1 FIX)
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

// Token refresh — authLimiter restored (BUG 1 FIX)
router.post(
  '/refresh-token',
  authLimiter,
  authController.refreshToken
);

// ─── PROTECTED ROUTES ─────────────────────────────────────────────────────────

router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getMe);
router.post('/invite-code', authenticate, authController.generateInviteCode);

// ─── TWO-FACTOR AUTHENTICATION ────────────────────────────────────────────────
// All 2FA routes live at /api/auth/2fa/*
router.use('/2fa', twoFactorRoutes);

module.exports = router;