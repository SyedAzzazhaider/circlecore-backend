require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const connectDB = require('./src/config/db');
const { connectRedis, getRedis } = require('./src/config/redis');
const blocklistConfig = require('./src/config/blocklist'); // Geo/blocklist Redis injection
const { initializeSocket } = require('./src/config/socket');
const { initializePubSub } = require('./src/config/pubsub');
const logger = require('./src/utils/logger');

const PORT = process.env.PORT || 5000;

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

    // Document requirement: Email digest scheduler — weekly digest to all users
    const digestService = require('./src/modules/notifications/digest.service');
    digestService.scheduleWeeklyDigest();
    // Document requirement: MODULE H — Auto-lift expired temporary suspensions
    const moderationService = require('./src/modules/moderation/moderation.service');
    setInterval(() => moderationService.liftExpiredSuspensions(), 60 * 60 * 1000);
    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM received. Shutting down gracefully...');
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