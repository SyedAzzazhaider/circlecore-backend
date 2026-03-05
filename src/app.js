require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const passport = require('./config/passport');          // OAuth strategies  ← NEW
const { globalLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const { authenticate } = require('./middleware/authenticate');
const { checkSessionTimeout } = require('./middleware/sessionTimeout');

// Route imports
const authRoutes = require('./modules/auth/auth.routes');
const oauthRoutes = require('./modules/auth/oauth.routes');  // OAuth routes  ← NEW
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

// ─── BODY PARSERS ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ─── PASSPORT (OAuth) ─────────────────────────────────────────────────────────
// Stateless — no session middleware needed. Passport is used only to handle
// the OAuth protocol exchange (token trade + profile fetch).
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

// ─── API ROUTES ───────────────────────────────────────────────────────────────
//
// BUG 2 FIX — CRITICAL:
// Previously: app.use('/api', checkSessionTimeout) was placed BEFORE all routes.
// At that point req.user is always undefined (authenticate hasn't run yet),
// so checkSessionTimeout silently skipped every request — it was completely non-functional.
//
// Fix strategy:
// A shared middleware stack [authenticate, checkSessionTimeout] is defined once
// and applied to every protected route group. This guarantees:
//   1. authenticate runs first → req.user is populated
//   2. checkSessionTimeout runs second → req.user is present → timeout is enforced
//   3. auth routes remain fully public (no authenticate applied)
//   4. Zero double-authentication — each request hits authenticate exactly once
//
const protected = [authenticate, checkSessionTimeout];

// Public — no session enforcement
app.use('/api/auth', authRoutes);
app.use('/api/auth/oauth', oauthRoutes);  // OAuth — Google, Apple, LinkedIn

// Protected — authenticate THEN checkSessionTimeout on every request
app.use('/api/profiles',      ...protected, profileRoutes);
app.use('/api/communities',   ...protected, communityRoutes);
app.use('/api/posts',         ...protected, postRoutes);
app.use('/api/comments',      ...protected, commentRoutes);
app.use('/api/notifications', ...protected, notificationRoutes);
app.use('/api/events',        ...protected, eventRoutes);
app.use('/api/search',        ...protected, searchRoutes);
app.use('/api/channels',      ...protected, channelRoutes);
app.use('/api/announcements', ...protected, announcementRoutes);
app.use('/api/gdpr',          ...protected, gdprRoutes);

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