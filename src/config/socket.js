const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const cache = require('../utils/cache');

let io = null;

const initializeSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Auth middleware for socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token ||
        socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.userRole = decoded.role;
      socket.userEmail = decoded.email;
      next();
    } catch (error) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    logger.info('User connected via socket: ' + userId);

    // Track online users
    await cache.set('online:' + userId, true, 300);

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
        userId,
        postId,
        isTyping: true,
      });
    });

    socket.on('typing:stop', ({ communityId, postId }) => {
      socket.to('community:' + communityId).emit('user:typing', {
        userId,
        postId,
        isTyping: false,
      });
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      await cache.delete('online:' + userId);
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

module.exports = {
  initializeSocket,
  getIO,
  emitToUser,
  emitToCommunity,
  emitToAll,
};