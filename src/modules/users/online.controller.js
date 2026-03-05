const cache = require('../../utils/cache');
const ApiResponse = require('../../utils/apiResponse');

class OnlineController {

  async getOnlineUsers(req, res, next) {
    try {
      const { getRedis } = require('../../config/redis');
      const redis = getRedis();

      if (!redis || redis.status !== 'ready') {
        return ApiResponse.success(res, {
          onlineUsers: [],
          count: 0,
        }, 'Online users fetched');
      }

      const keys = await redis.keys('online:*');
      const onlineUserIds = keys.map(k => k.replace('online:', ''));

      return ApiResponse.success(res, {
        onlineUsers: onlineUserIds,
        count: onlineUserIds.length,
      }, 'Online users fetched');

    } catch (error) {
      return ApiResponse.success(res, {
        onlineUsers: [],
        count: 0,
      }, 'Online users fetched');
    }
  }

  async isUserOnline(req, res, next) {
    try {
      const isOnline = await cache.get('online:' + req.params.userId);
      return ApiResponse.success(res, {
        userId: req.params.userId,
        isOnline: !!isOnline,
      }, 'User status fetched');
    } catch (error) {
      return ApiResponse.success(res, {
        userId: req.params.userId,
        isOnline: false,
      }, 'User status fetched');
    }
  }
}

module.exports = new OnlineController();