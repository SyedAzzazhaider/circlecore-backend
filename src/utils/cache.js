const { getRedis } = require('../config/redis');
const logger = require('./logger');

const DEFAULT_TTL = 300; // 5 minutes

class CacheService {

  isAvailable() {
    const client = getRedis();
    return client && client.status === 'ready';
  }

  async get(key) {
    try {
      if (!this.isAvailable()) return null;
      const data = await getRedis().get(key);
      if (!data) return null;
      return JSON.parse(data);
    } catch (error) {
      logger.error('Cache get error: ' + error.message);
      return null;
    }
  }

  async set(key, value, ttl = DEFAULT_TTL) {
    try {
      if (!this.isAvailable()) return false;
      await getRedis().setex(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error('Cache set error: ' + error.message);
      return false;
    }
  }

  async delete(key) {
    try {
      if (!this.isAvailable()) return false;
      await getRedis().del(key);
      return true;
    } catch (error) {
      logger.error('Cache delete error: ' + error.message);
      return false;
    }
  }

  async deletePattern(pattern) {
    try {
      if (!this.isAvailable()) return false;
      const keys = await getRedis().keys(pattern);
      if (keys.length > 0) {
        await getRedis().del(...keys);
      }
      return true;
    } catch (error) {
      logger.error('Cache deletePattern error: ' + error.message);
      return false;
    }
  }

  async flush() {
    try {
      if (!this.isAvailable()) return false;
      await getRedis().flushdb();
      return true;
    } catch (error) {
      logger.error('Cache flush error: ' + error.message);
      return false;
    }
  }

  // Cache keys factory
  keys = {
    communityFeed: (communityId, page) => `feed:${communityId}:${page}`,
    community: (slug) => `community:${slug}`,
    communityList: (page) => `communities:${page}`,
    profile: (userId) => `profile:${userId}`,
    post: (postId) => `post:${postId}`,
    notifications: (userId, page) => `notifications:${userId}:${page}`,
    unreadCount: (userId) => `unread:${userId}`,
    search: (query, type) => `search:${type}:${query}`,
    onlineUsers: () => 'online:users',
  };
}

module.exports = new CacheService();