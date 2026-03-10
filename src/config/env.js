/**
 * Environment Variable Validation
 *
 * CC-05 FIX: ONESIGNAL_APP_ID and ONESIGNAL_API_KEY added to productionRequired.
 *
 * These are production-required (not fatal in dev) because:
 *   - Dev/local: push notifications are disabled gracefully if keys absent
 *   - Production: push notifications are a document requirement (MODULE F)
 *     and must be present or users receive no offline notifications
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

// Keys required in production — warnings in development
const productionRequired = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'SENTRY_DSN',
  // CC-05 FIX: OneSignal push notifications — MODULE F requirement
  'ONESIGNAL_APP_ID',
  'ONESIGNAL_API_KEY',
];

const validateEnv = () => {
  // Fatal check — crash immediately if any critical key is missing
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      'Missing required environment variables: ' + missing.join(', ') +
      '\nSee .env.example for full configuration reference.'
    );
  }

  // JWT strength check
  if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }
  if (process.env.JWT_REFRESH_SECRET.length < 32) {
    throw new Error('JWT_REFRESH_SECRET must be at least 32 characters long');
  }

  // Production-only keys: warn in dev, throw in production
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

  // Placeholder value detection
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
