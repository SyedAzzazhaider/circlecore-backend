const ApiResponse = require('../../utils/apiResponse');
const logger      = require('../../utils/logger');

/**
 * Online Presence Controller
 *
 * CC-19 FIX: Online user queries rewritten to use Redis Set operations.
 *
 * BEFORE (problem in getOnlineUsers):
 *   const keys = await redis.keys('online:*');
 *
 *   redis.keys() is a blocking O(N) scan of the ENTIRE keyspace.
 *   Redis is single-threaded — while KEYS runs, no other command executes.
 *   This includes rate limiting, cache reads, session checks — everything stops.
 *
 * AFTER:
 *   getOnlineUsers → redis.smembers('online_users')
 *     O(N) on the SET SIZE only (number of online users).
 *     Non-blocking — does not scan keyspace.
 *
 *   isUserOnline  → redis.sismember('online_users', userId)
 *     O(1) — single set membership check.
 *     The previous cache.get('online:' + userId) was also O(1) but required
 *     maintaining hundreds of individual keys with TTLs.
 *     SISMEMBER on a single Set is cleaner and faster.
 *
 * Note on TTL: The individual 'online:userId' keys had 300s TTL to auto-expire
 * stale presence. The Set approach relies on the disconnect event.
 * For production resilience, the socket.js disconnect handler is the cleanup
 * mechanism. Server restarts clear Redis automatically if using in-memory Redis.
 * If using persistent Redis, add a server startup routine to flush online_users.
 */
class OnlineController {

  async getOnlineUsers(req, res, next) {
    try {
      const { getRedis } = require('../../config/redis');
      const redis = getRedis();

      if (!redis || redis.status !== 'ready') {
        return ApiResponse.success(res, { onlineUsers: [], count: 0 }, 'Online users fetched');
      }

      // CC-19 FIX: SMEMBERS — O(N) on SET size only, non-blocking
      // Replaces: redis.keys('online:*') which was O(N) on ENTIRE keyspace
      const onlineUserIds = await redis.smembers('online_users');

      return ApiResponse.success(res, {
        onlineUsers: onlineUserIds,
        count:       onlineUserIds.length,
      }, 'Online users fetched');

    } catch (error) {
      logger.error('getOnlineUsers error: ' + error.message);
      return ApiResponse.success(res, { onlineUsers: [], count: 0 }, 'Online users fetched');
    }
  }

  async isUserOnline(req, res, next) {
    try {
      const { getRedis } = require('../../config/redis');
      const redis = getRedis();

      if (!redis || redis.status !== 'ready') {
        return ApiResponse.success(res, { userId: req.params.userId, isOnline: false }, 'User status fetched');
      }

      // CC-19 FIX: SISMEMBER — O(1) set membership check
      // Returns 1 (member) or 0 (not member)
      const result   = await redis.sismember('online_users', req.params.userId);
      const isOnline = result === 1;

      return ApiResponse.success(res, {
        userId:   req.params.userId,
        isOnline,
      }, 'User status fetched');

    } catch (error) {
      return ApiResponse.success(res, {
        userId:   req.params.userId,
        isOnline: false,
      }, 'User status fetched');
    }
  }
}

module.exports = new OnlineController();
