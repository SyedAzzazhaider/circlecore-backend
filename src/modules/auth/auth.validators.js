const { body } = require('express-validator');

/**
 * Auth Validators
 *
 * CC-25 FIX: Password policy strengthened in registerValidator and resetPasswordValidator.
 *
 * BEFORE:
 *   .isLength({ min: 8 })
 *   .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
 *   message: 'Password must contain uppercase, lowercase and a number'
 *
 *   Problems:
 *     1. 8-character minimum is below NIST SP 800-63B recommendation (12+)
 *     2. No special character requirement — "Password1" passes, trivially brute-forceable
 *     3. Double isLength calls (min:8 then later validation) left ambiguous contract
 *
 * AFTER:
 *   .isLength({ min: 12 })   — raised to 12, single call
 *   .matches(...)            — adds (?=.*[special char]) lookahead
 *   message: updated to include special character instruction
 *
 * Note: loginValidator intentionally has NO password strength check —
 * users with old passwords must still be able to log in.
 * Strength check on login is a UX anti-pattern and breaks existing accounts.
 */

// ─── Special char lookahead pattern ──────────────────────────────────────────
// Matches: ! @ # $ % ^ & * ( ) - _ = + { } ; : , < . > ?
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+{};:,<.>?])/;
const PASSWORD_MSG   = 'Password must contain uppercase, lowercase, a number, and a special character (!@#$%^&*)';

// ─── Register ─────────────────────────────────────────────────────────────────
const registerValidator = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),

  // CC-25 FIX: min 12 + special char — single isLength call
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 12 }).withMessage('Password must be at least 12 characters')
    .matches(PASSWORD_REGEX).withMessage(PASSWORD_MSG),

  body('inviteCode')
    .trim()
    .notEmpty().withMessage('Invite code is required')
    .isLength({ min: 8, max: 20 }).withMessage('Invalid invite code format'),
];

// ─── Login ────────────────────────────────────────────────────────────────────
// NO password strength check — users with old accounts must still log in.
const loginValidator = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required'),
];

// ─── Forgot Password ──────────────────────────────────────────────────────────
const forgotPasswordValidator = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),
];

// ─── Reset Password ───────────────────────────────────────────────────────────
// CC-25 FIX: same strength requirements as register — this is a new password
const resetPasswordValidator = [
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 12 }).withMessage('Password must be at least 12 characters')
    .matches(PASSWORD_REGEX).withMessage(PASSWORD_MSG),

  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) throw new Error('Passwords do not match');
      return true;
    }),
];

module.exports = {
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
};
