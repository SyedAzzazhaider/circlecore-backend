require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const passport = require('./config/passport');
const { geoBlocklist } = require('./middleware/geoBlocklist');
const { globalLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const { authenticate } = require('./middleware/authenticate');
const { checkSessionTimeout } = require('./middleware/sessionTimeout');

// Route imports — Modules 1-4
const authRoutes = require('./modules/auth/auth.routes');
const oauthRoutes = require('./modules/auth/oauth.routes');
const profileRoutes = require('./modules/users/profile.routes');
const communityRoutes = require('./modules/communities/community.routes');
const postRoutes = require('./modules/posts/post.routes');
const commentRoutes = require('./modules/comments/comment.routes');
const notificationRoutes = require('./modules/notifications/notification.routes');
const eventRoutes = require('./modules/events/event.routes');
const searchRoutes = require('./modules/search/search.routes');
const channelRoutes = require('./modules/communities/channel.routes');
const announcementRoutes = require('./modules/admin/announcement.routes');
const gdprRoutes = require('./modules/users/gdpr.routes');
const uploadRoutes = require('./modules/upload/upload.routes');

// Route imports — Module 5: Tiered Membership & Billing
const billingRoutes = require('./modules/billing/billing.routes');
const moderationRoutes = require('./modules/moderation/moderation.routes');


const app = express();

// ─── SECURITY HEADERS ─────────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── GEO / IP BLOCKLIST ───────────────────────────────────────────────────────
// Must run BEFORE body parsers so blocked requests are rejected immediately.
app.set('trust proxy', 1);
app.use(geoBlocklist);

// ─── BODY PARSERS ─────────────────────────────────────────────────────────────
// IMPORTANT: Stripe webhook requires raw body for signature verification.
// express.json() is skipped for /api/billing/webhook/stripe — express.raw()
// is applied directly on that route inside billing.routes.js instead.
app.use((req, res, next) => {
  if (req.originalUrl === '/api/billing/webhook/stripe') {
    next();
  } else {
    express.json({ limit: '10mb' })(req, res, next);
  }
});
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ─── PASSPORT (OAuth) ─────────────────────────────────────────────────────────
app.use(passport.initialize());

// ─── HTTP LOGGING ─────────────────────────────────────────────────────────────
app.use(morgan('combined', {
  stream: { write: (message) => logger.http(message.trim()) },
  skip: () => process.env.NODE_ENV === 'test',
}));

// ─── GLOBAL RATE LIMITER ──────────────────────────────────────────────────────
app.use(globalLimiter);

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.status(200).json({
  success: true,
  message: 'CircleCore API is running',
  environment: process.env.NODE_ENV,
  timestamp: new Date().toISOString(),
}));

// ─── ROUTE PROTECTION STACK ───────────────────────────────────────────────────
// Used ONLY for routers where EVERY endpoint requires authentication.
// authenticate runs first → req.user is populated
// checkSessionTimeout runs second → timeout is enforced with req.user present
//
// DO NOT apply to routers that have a MIX of public and protected endpoints.
// Those routers manage their own per-route authenticate calls internally.
const protectedMiddleware = [authenticate, checkSessionTimeout];

// ─── PUBLIC + MIXED ROUTES ────────────────────────────────────────────────────
// No global auth applied — each router manages its own per-route auth.

// Auth routes — entirely public (login, register, etc.)
app.use('/api/auth', authRoutes);
app.use('/api/auth/oauth', oauthRoutes);
app.use('/api/invites', authRoutes);

// Communities — MIXED: GET / and GET /:slug are public, rest require auth.
// The community.routes.js file applies authenticate per-route correctly.
// Applying protectedMiddleware here would block the public GET endpoints → 401.
app.use('/api/communities', communityRoutes);

// Billing — MIXED: GET /plans and webhooks are public, rest require auth.
// The billing.routes.js file applies authenticate per-route correctly.
app.use('/api/billing', billingRoutes);
app.use('/api/moderation', moderationRoutes);

// ─── FULLY PROTECTED ROUTES ───────────────────────────────────────────────────
// Every single endpoint in these routers requires a valid JWT.
// Safe to apply protectedMiddleware globally at this level.
app.use('/api/profiles',      ...protectedMiddleware, profileRoutes);
app.use('/api/posts',         ...protectedMiddleware, postRoutes);
app.use('/api/comments',      ...protectedMiddleware, commentRoutes);
app.use('/api/notifications', ...protectedMiddleware, notificationRoutes);
app.use('/api/events',        ...protectedMiddleware, eventRoutes);
app.use('/api/search',        ...protectedMiddleware, searchRoutes);
app.use('/api/channels',      ...protectedMiddleware, channelRoutes);
app.use('/api/announcements', ...protectedMiddleware, announcementRoutes);
app.use('/api/gdpr',          ...protectedMiddleware, gdprRoutes);
app.use('/api/upload', uploadRoutes);

// ─── 404 HANDLER ──────────────────────────────────────────────────────────────
app.use(function (req, res) {
  res.status(404).json({
    success: false,
    message: 'Route ' + req.originalUrl + ' not found',
  });
});

// ─── GLOBAL ERROR HANDLER ─────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;