/**
 * Environment Variable Validation
 * Runs at server startup — fails fast before any connections are attempted.
 * FIX: expanded from 5 to full critical variable set.
 */

const required = [
  // Core
  'MONGODB_URI',
  'FRONTEND_URL',
  // Auth
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  // Email
  'SENDGRID_API_KEY',
  'SENDGRID_FROM_EMAIL',
];

const validateEnv = () => {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error('Missing required environment variables: ' + missing.join(', '));
  }

  // JWT strength check — must be at least 32 characters
  if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }
  if (process.env.JWT_REFRESH_SECRET.length < 32) {
    throw new Error('JWT_REFRESH_SECRET must be at least 32 characters long');
  }

  // Warn about placeholder values still in .env
  const placeholders = [
    'your_',
    'change_in_production',
    'placeholder',
    'changeme',
    'secret_key_here',
  ];

  const suspicious = [
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'SENDGRID_API_KEY',
  ].filter((key) => {
    const val = (process.env[key] || '').toLowerCase();
    return placeholders.some((p) => val.includes(p));
  });

  if (suspicious.length > 0) {
    // Warn but do not crash — allows staging deployments with partial config
    console.warn('[ENV WARNING] Possible placeholder values detected in: ' + suspicious.join(', '));
  }
};

module.exports = { validateEnv };