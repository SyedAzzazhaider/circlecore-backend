const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient = null;

const connectRedis = () => {
  if (!process.env.REDIS_URL) {
    logger.warn('Redis URL not configured — caching disabled');
    return null;
  }

  redisClient = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 3) {
        logger.error('Redis connection failed after 3 retries');
        return null;
      }
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
  });

  redisClient.on('connect', () => logger.info('Redis connected successfully'));
  redisClient.on('error', (err) => logger.error('Redis error: ' + err.message));
  redisClient.on('close', () => logger.warn('Redis connection closed'));

  return redisClient;
};

const getRedis = () => redisClient;

module.exports = { connectRedis, getRedis };