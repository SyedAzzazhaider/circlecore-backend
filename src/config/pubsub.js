const logger = require('../utils/logger');

/**
 * Redis Pub/Sub — multi-server socket scaling
 * Document requirement: MODULE D — Redis for pub/sub
 * When running multiple backend instances, socket events must be
 * broadcast across all servers via Redis pub/sub channels.
 */

let publisher = null;
let subscriber = null;
let io = null;

const CHANNELS = {
  POST_NEW: 'circlecore:post:new',
  POST_DELETED: 'circlecore:post:deleted',
  POST_REACTION: 'circlecore:post:reaction',
  COMMENT_NEW: 'circlecore:comment:new',
  NOTIFICATION_NEW: 'circlecore:notification:new',
  USER_ONLINE: 'circlecore:user:online',
  USER_OFFLINE: 'circlecore:user:offline',
};

/**
 * Initialize Redis pub/sub with separate publisher and subscriber connections
 * Must use separate Redis connections — a subscribed client cannot publish
 */
const initializePubSub = async (socketIo) => {
  try {
    io = socketIo;

    const Redis = require('ioredis');
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    };

    publisher = new Redis(redisConfig);
    subscriber = new Redis(redisConfig);

    await publisher.connect();
    await subscriber.connect();

    // Subscribe to all CircleCore channels
    await subscriber.subscribe(Object.values(CHANNELS));

    // Handle incoming messages from other server instances
    subscriber.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);
        handleIncomingMessage(channel, data);
      } catch (e) {
        logger.error('Pub/sub message parse error: ' + e.message);
      }
    });

    publisher.on('error', (err) => {
      logger.warn('Redis publisher error: ' + err.message);
    });

    subscriber.on('error', (err) => {
      logger.warn('Redis subscriber error: ' + err.message);
    });

    logger.info('Redis pub/sub initialized for multi-server scaling');
  } catch (error) {
    logger.warn('Redis pub/sub unavailable — running single server mode: ' + error.message);
  }
};

/**
 * Route incoming pub/sub messages to correct socket rooms
 */
const handleIncomingMessage = (channel, data) => {
  if (!io) return;

  switch (channel) {
    case CHANNELS.POST_NEW:
      io.to('community:' + data.communityId).emit('post:new', data);
      break;
    case CHANNELS.POST_DELETED:
      io.to('community:' + data.communityId).emit('post:deleted', data);
      break;
    case CHANNELS.POST_REACTION:
      io.to('community:' + data.communityId).emit('post:reaction', data);
      break;
    case CHANNELS.COMMENT_NEW:
      io.to('community:' + data.communityId).emit('comment:new', data);
      break;
    case CHANNELS.NOTIFICATION_NEW:
      io.to('user:' + data.userId).emit('notification:new', data);
      break;
    case CHANNELS.USER_ONLINE:
      io.emit('user:online', { userId: data.userId });
      break;
    case CHANNELS.USER_OFFLINE:
      io.emit('user:offline', { userId: data.userId });
      break;
    default:
      break;
  }
};

/**
 * Publish an event to all server instances via Redis
 */
const publish = async (channel, data) => {
  if (!publisher) return;
  try {
    await publisher.publish(channel, JSON.stringify(data));
  } catch (error) {
    logger.warn('Pub/sub publish failed: ' + error.message);
  }
};

module.exports = {
  initializePubSub,
  publish,
  CHANNELS,
};