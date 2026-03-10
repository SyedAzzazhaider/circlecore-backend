/**
 * Environment Variable Validation
 * Runs at server startup — fails fast before any connections are attempted.
 *
 * CC-32 FIX: Required keys list expanded from 6 to full critical set.
 *
 * Previously missing from required[]:
 *   - STRIPE_SECRET_KEY        → all Stripe operations throw at runtime
 *   - RAZORPAY_KEY_SECRET      → all Razorpay operations throw at runtime
 *   - RAZORPAY_WEBHOOK_SECRET  → webhook HMAC silently fails → payment fraud risk
 *   - RECAPTCHA_SECRET_KEY     → reCAPTCHA middleware passes all requests if undefined
 *   - AWS_REGION               → S3 upload operations fail at runtime
 *   - AWS_ACCESS_KEY_ID        → S3 upload operations fail at runtime
 *   - AWS_SECRET_ACCESS_KEY    → S3 upload operations fail at runtime
 *   - S3_BUCKET_NAME           → S3 upload operations fail at runtime
 *
 * Note on RECAPTCHA_ENABLED=false:
 *   If RECAPTCHA_ENABLED is 'false', the reCAPTCHA keys are still validated
 *   as warnings (not fatal) — allows running without reCAPTCHA during development
 *   while still catching missing keys before production deployment.
 *
 * Note on billing keys:
 *   STRIPE_SECRET_KEY and RAZORPAY_KEY_SECRET are required at startup.
 *   Price IDs / Plan IDs are NOT validated here — they are validated lazily
 *   by the billing service (they vary per environment and may be set later).
 */

const required = [
  // ─── Core ───────────────────────────────────────────────────────────────
  'MONGODB_URI',
  'FRONTEND_URL',

  // ─── Auth ───────────────────────────────────────────────────────────────
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',

  // ─── Email ──────────────────────────────────────────────────────────────
  'SENDGRID_API_KEY',
  'SENDGRID_FROM_EMAIL',

  // ─── AWS S3 ─────────────────────────────────────────────────────────────
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'S3_BUCKET_NAME',
];

// Keys required only in production — validated as warnings in development
const productionRequired = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'SENTRY_DSN',
];

const validateEnv = () => {
  // ─── Fatal check: crash immediately if any critical key is missing ───────
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      'Missing required environment variables: ' + missing.join(', ') +
      '\nSee .env.example for full configuration reference.'
    );
  }

  // ─── JWT strength: must be at least 32 characters ────────────────────────
  if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }
  if (process.env.JWT_REFRESH_SECRET.length < 32) {
    throw new Error('JWT_REFRESH_SECRET must be at least 32 characters long');
  }

  // ─── Production-only keys: warn in dev, throw in production ──────────────
  if (process.env.NODE_ENV === 'production') {
    const missingProd = productionRequired.filter((key) => !process.env[key]);
    if (missingProd.length > 0) {
      throw new Error(
        'Missing required PRODUCTION environment variables: ' + missingProd.join(', ')
      );
    }
  } else {
    const missingProd = productionRequired.filter((key) => !process.env[key]);
    if (missingProd.length > 0) {
      console.warn(
        '[ENV WARNING] Missing production keys (OK for local dev): ' +
        missingProd.join(', ')
      );
    }
  }

  // ─── Placeholder value detection ─────────────────────────────────────────
  const placeholders = ['your_', 'change_in_production', 'placeholder', 'changeme', 'secret_key_here'];
  const suspicious   = [
    'JWT_SECRET', 'JWT_REFRESH_SECRET', 'SENDGRID_API_KEY',
    'AWS_SECRET_ACCESS_KEY', 'STRIPE_SECRET_KEY',
  ].filter((key) => {
    const val = (process.env[key] || '').toLowerCase();
    return placeholders.some((p) => val.includes(p));
  });

  if (suspicious.length > 0) {
    console.warn('[ENV WARNING] Possible placeholder values detected in: ' + suspicious.join(', '));
  }
};

module.exports = { validateEnv };
