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

  /**
   * FIX: replaced Redis KEYS (blocking O(N)) with SCAN (non-blocking, cursor-based).
   * KEYS blocks the entire Redis server while scanning — dangerous in production
   * with large key sets. SCAN iterates in small batches without blocking.
   */
  async deletePattern(pattern) {
    try {
      if (!this.isAvailable()) return false;

      const client = getRedis();
      let cursor = '0';
      const keysToDelete = [];

      do {
        const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        keysToDelete.push(...keys);
      } while (cursor !== '0');

      if (keysToDelete.length > 0) {
        // Delete in batches of 500 to avoid oversized Redis commands
        const BATCH_SIZE = 500;
        for (let i = 0; i < keysToDelete.length; i += BATCH_SIZE) {
          const batch = keysToDelete.slice(i, i + BATCH_SIZE);
          await client.del(...batch);
        }
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