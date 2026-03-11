require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const cookieParser = require('cookie-parser');
const morgan       = require('morgan');
const passport     = require('./config/passport');
const { geoBlocklist }      = require('./middleware/geoBlocklist');
const { globalLimiter }     = require('./middleware/rateLimiter');
const errorHandler          = require('./middleware/errorHandler');
const logger                = require('./utils/logger');
const { authenticate }      = require('./middleware/authenticate');
const { checkSessionTimeout } = require('./middleware/sessionTimeout');
const mongoSanitize         = require('express-mongo-sanitize');

// ─── CC-13 FIX: Sentry — initialize BEFORE all routes ────────────────────────
// Must be the very first thing after requires. Sentry instruments Express
// automatically when initialized here — captures all unhandled exceptions.
// No-op if SENTRY_DSN is not set (safe for local development).
if (process.env.SENTRY_DSN) {
  const Sentry = require('@sentry/node');
  Sentry.init({
    dsn:         process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    // Capture 100% of transactions in production — adjust down at scale
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
  logger.info('Sentry initialized — environment: ' + (process.env.NODE_ENV || 'production'));
}

// Route imports — Modules 1–6
const authRoutes         = require('./modules/auth/auth.routes');
const oauthRoutes        = require('./modules/auth/oauth.routes');
const profileRoutes      = require('./modules/users/profile.routes');
const communityRoutes    = require('./modules/communities/community.routes');
const postRoutes         = require('./modules/posts/post.routes');
const commentRoutes      = require('./modules/comments/comment.routes');
const notificationRoutes = require('./modules/notifications/notification.routes');
const eventRoutes        = require('./modules/events/event.routes');
const searchRoutes       = require('./modules/search/search.routes');
const channelRoutes      = require('./modules/communities/channel.routes');
const announcementRoutes = require('./modules/admin/announcement.routes');
const gdprRoutes         = require('./modules/users/gdpr.routes');
const uploadRoutes       = require('./modules/upload/upload.routes');
const billingRoutes      = require('./modules/billing/billing.routes');
const adminRoutes        = require('./modules/admin/admin.routes');
const moderationRoutes   = require('./modules/moderation/moderation.routes');

const app = express();

// ─── CC-33 FIX: Helmet with Content Security Policy ──────────────────────────
// Default helmet() has no CSP — leaves the app vulnerable to XSS attacks that
// inject inline scripts. This is critical for an app serving user-generated content.
//
// CSP directives explained:
//   defaultSrc 'self'          → only load resources from our own origin by default
//   scriptSrc  'self'          → block all inline scripts and external script sources
//   styleSrc   'self' 'unsafe-inline' → allow inline styles (needed for most UI frameworks)
//   imgSrc     self + S3 + data → allow our S3 bucket for user avatars/media
//   connectSrc 'self'          → restrict AJAX/fetch/WebSocket to our own origin
//   frameAncestors 'none'      → prevent clickjacking — no one can iframe our app
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:      ["'self'"],
      scriptSrc:       ["'self'"],
      styleSrc:        ["'self'", "'unsafe-inline'"],
      imgSrc:          [
        "'self'",
        'data:',
        process.env.S3_BUCKET_NAME
          ? 'https://' + process.env.S3_BUCKET_NAME + '.s3.' + (process.env.AWS_REGION || 'us-east-1') + '.amazonaws.com'
          : 'https://*.amazonaws.com',
      ],
      connectSrc:      ["'self'"],
      fontSrc:         ["'self'"],
      objectSrc:       ["'none'"],
      frameAncestors:  ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false, // Set false — some browsers block S3 presigned URLs otherwise
  hsts: {
    maxAge:            31536000,  // 1 year
    includeSubDomains: true,
    preload:           true,
  },
}));

// ─── CC-34 FIX: CORS allowlist — multi-environment support ───────────────────
// Previously: origin: process.env.FRONTEND_URL — one string that blocked staging,
// mobile apps, admin dashboards, and any domain other than FRONTEND_URL.
//
// Fix: ALLOWED_ORIGINS is a comma-separated list of permitted origins.
// Example .env:
//   ALLOWED_ORIGINS=https://app.circlecore.com,https://staging.circlecore.com,http://localhost:3000
//
// Backward compatible: falls back to FRONTEND_URL if ALLOWED_ORIGINS is not set.
const ALLOWED_ORIGINS = (
  process.env.ALLOWED_ORIGINS ||
  process.env.FRONTEND_URL    ||
  'http://localhost:3000'
).split(',').map(o => o.trim()).filter(Boolean);

logger.info('CORS allowed origins: ' + ALLOWED_ORIGINS.join(', '));

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server requests (no origin header) and whitelisted origins
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    logger.warn('CORS blocked request from origin: ' + origin);
    callback(new Error('CORS policy: origin ' + origin + ' is not allowed'));
  },
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── GEO / IP BLOCKLIST ───────────────────────────────────────────────────────
app.set('trust proxy', 1);
app.use(geoBlocklist);

// ─── BODY PARSERS ─────────────────────────────────────────────────────────────
// Stripe + Razorpay webhooks need raw Buffer bodies — skipped for both webhook paths.
// express.raw() is applied directly on those routes inside billing.routes.js.
app.use((req, res, next) => {
  if (
    req.originalUrl === '/api/billing/webhook/stripe' ||
    req.originalUrl === '/api/billing/webhook/razorpay'
  ) {
    return next();
  }
  express.json({ limit: '10mb' })(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ─── CC-31: NoSQL injection protection (from Step 1) ─────────────────────────
app.use(mongoSanitize());
// ─── PASSPORT (OAuth) ─────────────────────────────────────────────────────────
app.use(passport.initialize());

// ─── HTTP LOGGING ─────────────────────────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (message) => logger.http(message.trim()) },
  skip:   () => process.env.NODE_ENV === 'test',
}));

// ─── GLOBAL RATE LIMITER ──────────────────────────────────────────────────────
app.use(globalLimiter);

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
// CC-28 FIX: Real health check with DB + Redis probe is registered in server.js
// BEFORE startServer() runs — this ensures it responds even during startup.
// See server.js for the implementation.

// ─── ROUTE PROTECTION STACK ───────────────────────────────────────────────────
const protectedMiddleware = [authenticate, checkSessionTimeout];

// ─── PUBLIC + MIXED ROUTES ────────────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/auth/oauth',  oauthRoutes);
app.use('/api/invites',     authRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/billing',     billingRoutes);
app.use('/api/moderation',  moderationRoutes);

// ─── FULLY PROTECTED ROUTES ───────────────────────────────────────────────────
app.use('/api/profiles',      ...protectedMiddleware, profileRoutes);
app.use('/api/posts',         ...protectedMiddleware, postRoutes);
app.use('/api/comments',      ...protectedMiddleware, commentRoutes);
app.use('/api/notifications', ...protectedMiddleware, notificationRoutes);
app.use('/api/events',        ...protectedMiddleware, eventRoutes);
app.use('/api/search',        ...protectedMiddleware, searchRoutes);
app.use('/api/channels',      ...protectedMiddleware, channelRoutes);
app.use('/api/announcements', ...protectedMiddleware, announcementRoutes);
app.use('/api/gdpr',          ...protectedMiddleware, gdprRoutes);
app.use('/api/upload',        uploadRoutes);
app.use('/api/admin',         ...protectedMiddleware, adminRoutes);


// ─── CC-30 FIX: API Documentation (development only) ──────────────────────────
const { setupApiDocs } = require('./utils/apiDocs');
setupApiDocs(app);
// ─── 404 HANDLER ──────────────────────────────────────────────────────────────
app.use(function (req, res) {
  res.status(404).json({
    success: false,
    message: 'Route ' + req.originalUrl + ' not found',
  });
});

// ─── CC-13 FIX: Sentry Express error handler — MUST be before errorHandler ───
// Captures errors that propagate through next(err) calls in all routes.
if (process.env.SENTRY_DSN) {
  try {
    const Sentry = require('@sentry/node');
    Sentry.setupExpressErrorHandler(app);
  } catch (e) {
    logger.warn('Sentry Express error handler setup failed: ' + e.message);
  }
}

// ─── GLOBAL ERROR HANDLER ─────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
