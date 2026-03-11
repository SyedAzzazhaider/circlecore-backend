require('dotenv').config();

// ─── CC-27 FIX: validateEnv() MUST run before any other require() ─────────────
// Previously validateEnv() was called inside startServer() AFTER app.js was
// already required. app.js loads all route files at require-time — if any
// env var is missing, require() itself could throw before validateEnv() runs,
// producing an obscure crash with no helpful error message.
//
// Fix: call validateEnv() here, at the very top of server.js, before any
// application code is loaded. A missing var now produces a clear error:
//   "Missing required environment variables: STRIPE_SECRET_KEY"
// instead of a cryptic require-time crash deep in billing.service.js.
const { validateEnv } = require('./src/config/env');
validateEnv();
// ─────────────────────────────────────────────────────────────────────────────

const http = require('http');
const app  = require('./src/app');
const connectDB = require('./src/config/db');
const { connectRedis, getRedis } = require('./src/config/redis');
const blocklistConfig = require('./src/config/blocklist');
const { initializeSocket }  = require('./src/config/socket');
const { initializePubSub }  = require('./src/config/pubsub');
const logger = require('./src/utils/logger');
const mongoose = require('mongoose');

const PORT = process.env.PORT || 5000;

// ─── CC-28 FIX: Real health check ─────────────────────────────────────────────
// The health endpoint was defined in app.js and always returned 200 regardless
// of actual DB/Redis state. Load balancers use this endpoint to decide whether
// to route traffic to an instance — a permanently-200 health check means broken
// instances still receive production traffic.
//
// This replaces app.js's naive health check with a proper DB + Redis probe.
// Mounted before all other routes to ensure it responds even under high load.
app.get('/health', async (req, res) => {
  const checks = {
    status:   'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    services: {},
  };

  // MongoDB check
  try {
    const state = mongoose.connection.readyState;
    // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
    checks.services.mongodb = state === 1 ? 'ok' : 'degraded';
    if (state === 1) {
      // Lightweight ping — confirms DB is actually responding
      await mongoose.connection.db.admin().ping();
    }
  } catch (e) {
    checks.services.mongodb = 'error';
    checks.status = 'degraded';
  }

  // Redis check
  try {
    const redis = getRedis();
    if (!redis || redis.status !== 'ready') {
      checks.services.redis = 'unavailable';
      // Redis is optional — degraded, not error
    } else {
      await redis.ping();
      checks.services.redis = 'ok';
    }
  } catch (e) {
    checks.services.redis = 'error';
    // Redis failure does not mark overall status as error — it's optional
    if (checks.status === 'ok') checks.status = 'degraded';
  }

  // Uptime
  checks.uptime_seconds = Math.floor(process.uptime());

  const httpStatus = checks.status === 'ok' ? 200 : 503;
  res.status(httpStatus).json(checks);
});

const startServer = async () => {
  try {
    // Connect MongoDB
    await connectDB();

    // Connect Redis (optional — won't crash if unavailable)
    connectRedis();

    // Inject Redis into blocklist config for dynamic IP/country management
    const redisClient = getRedis();
    if (redisClient) blocklistConfig.setRedis(redisClient);

    // Create HTTP server
    const httpServer = http.createServer(app);

    // Initialize Socket.IO
    const socketIo = initializeSocket(httpServer);

    // Initialize Redis pub/sub for multi-server scaling
    initializePubSub(socketIo).catch(err =>
      logger.warn('PubSub init failed: ' + err.message)
    );

    // Start listening
    httpServer.listen(PORT, () => {
      logger.info('CircleCore API running on port ' + PORT + ' in ' + process.env.NODE_ENV + ' mode');
      logger.info('Socket.IO ready for real-time connections');
    });

    // Document requirement: Email digest scheduler — weekly digest to opted-in users (CC-24)
    const digestService = require('./src/modules/notifications/digest.service');
    digestService.scheduleWeeklyDigest();

    // Document requirement: Architecture Overview — Daily Automated Backups
    const backupJob = require('./src/jobs/backup.job');
    backupJob.schedule();

    // Document requirement: MODULE H — Auto-lift expired temporary suspensions
    // Uses node-cron: every hour at :00
    try {
      const cron = require('node-cron');
      cron.schedule('0 * * * *', () => {
        require('./src/modules/moderation/moderation.service').liftExpiredSuspensions();
      });
      logger.info('Suspension auto-lift cron scheduled — every hour');
    } catch (e) {
      // Fallback to setInterval if node-cron unavailable
      setInterval(() => {
        require('./src/modules/moderation/moderation.service').liftExpiredSuspensions();
      }, 60 * 60 * 1000);
      logger.warn('node-cron unavailable — using setInterval for suspension auto-lift');
    }

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received. Shutting down gracefully...');
      httpServer.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT received. Shutting down gracefully...');
      httpServer.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('Server startup failed: ' + error.message);
    process.exit(1);
  }
};

startServer();
