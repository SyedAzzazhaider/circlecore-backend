const { Server } = require('socket.io');
const jwt    = require('jsonwebtoken');
const logger = require('../utils/logger');
const cache  = require('../utils/cache');

/**
 * Socket.IO Configuration
 *
 * CC-19 FIX: Online presence tracking rewritten from individual keys to Redis Set.
 *
 * BEFORE (problem):
 *   Connect:    cache.set('online:' + userId, true, 300)
 *   Disconnect: cache.delete('online:' + userId)
 *   Query:      redis.keys('online:*')   ← THE PROBLEM
 *
 *   redis.keys() iterates the ENTIRE Redis keyspace — O(N) on all keys,
 *   not just online:* keys. While scanning it holds the Redis GIL (Global
 *   Interpreter Lock), blocking ALL other Redis commands:
 *     - Rate limiting checks → delayed
 *     - Session validations → delayed
 *     - Cache reads → delayed
 *     - Other socket operations → delayed
 *
 *   At 1,000 concurrent users with 50,000 total Redis keys,
 *   a keys() call takes ~10ms and blocks everything in that window.
 *   At 10,000 users this becomes 100ms+ of full Redis stall per call.
 *
 * AFTER (fixed):
 *   Connect:    redis.sadd('online_users', userId)   ← O(1)
 *   Disconnect: redis.srem('online_users', userId)   ← O(1)
 *   Query:      redis.smembers('online_users')        ← O(N on SET size only)
 *   Membership: redis.sismember('online_users', id)  ← O(1) single lookup
 *
 *   Redis Set operations are non-blocking and do not scan the keyspace.
 *   smembers reads only the set contents — not the full key namespace.
 *
 * Graceful fallback: if Redis is unavailable, online presence is skipped
 * (non-fatal — users can still connect and use all other features).
 */

let io = null;

const initializeSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin:      process.env.FRONTEND_URL || 'http://localhost:3000',
      methods:     ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout:  60000,
    pingInterval: 25000,
  });

  // Auth middleware for socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token ||
        socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) return next(new Error('Authentication required'));

      const decoded    = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId    = decoded.userId;
      socket.userRole  = decoded.role;
      socket.userEmail = decoded.email;
      next();
    } catch (error) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    logger.info('User connected via socket: ' + userId);

    // CC-19 FIX: SADD to Redis Set — O(1), non-blocking
    // Replaces: cache.set('online:' + userId, true, 300)
    try {
      const { getRedis } = require('./redis');
      const redis = getRedis();
      if (redis && redis.status === 'ready') {
        await redis.sadd('online_users', userId.toString());
      }
    } catch (e) {
      logger.warn('Online presence SADD failed (non-fatal): ' + e.message);
    }

    // Join personal room for private notifications
    socket.join('user:' + userId);

    // Join community rooms
    socket.on('join:community', (communityId) => {
      socket.join('community:' + communityId);
      logger.info('User ' + userId + ' joined room: community:' + communityId);
    });

    // Leave community room
    socket.on('leave:community', (communityId) => {
      socket.leave('community:' + communityId);
      logger.info('User ' + userId + ' left room: community:' + communityId);
    });

    // Typing indicator
    socket.on('typing:start', ({ communityId, postId }) => {
      socket.to('community:' + communityId).emit('user:typing', {
        userId, postId, isTyping: true,
      });
    });

    socket.on('typing:stop', ({ communityId, postId }) => {
      socket.to('community:' + communityId).emit('user:typing', {
        userId, postId, isTyping: false,
      });
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      // CC-19 FIX: SREM from Redis Set — O(1), non-blocking
      // Replaces: cache.delete('online:' + userId)
      try {
        const { getRedis } = require('./redis');
        const redis = getRedis();
        if (redis && redis.status === 'ready') {
          await redis.srem('online_users', userId.toString());
        }
      } catch (e) {
        logger.warn('Online presence SREM failed (non-fatal): ' + e.message);
      }

      logger.info('User disconnected: ' + userId);
    });
  });

  logger.info('Socket.IO initialized successfully');
  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
};

const emitToUser = (userId, event, data) => {
  if (!io) return;
  io.to('user:' + userId).emit(event, data);
};

const emitToCommunity = (communityId, event, data) => {
  if (!io) return;
  io.to('community:' + communityId).emit(event, data);
};

const emitToAll = (event, data) => {
  if (!io) return;
  io.emit(event, data);
};

module.exports = { initializeSocket, getIO, emitToUser, emitToCommunity, emitToAll };
