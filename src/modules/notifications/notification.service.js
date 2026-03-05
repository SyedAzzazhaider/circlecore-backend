const Notification = require('./notification.model');
const cache = require('../../utils/cache');
const logger = require('../../utils/logger');

class NotificationService {

  async createNotification({ userId, type, title, message, meta = {} }) {
    try {
      const notification = await Notification.create({
        userId, type, title, message, meta,
      });

      // Invalidate notification cache
      await cache.deletePattern('notifications:' + userId + ':*');
      await cache.delete(cache.keys.unreadCount(userId));

      // Emit real-time notification
      try {
        const { emitToUser } = require('../../config/socket');
        emitToUser(userId.toString(), 'notification:new', {
          notification,
          message: title,
        });
      } catch (e) {
        logger.warn('Socket notification emit failed: ' + e.message);
      }

      logger.info('Notification created for user: ' + userId);
      return notification;
    } catch (error) {
      logger.error('Failed to create notification: ' + error.message);
    }
  }

  async getUserNotifications(userId, { page = 1, limit = 20, unreadOnly = false }) {
    const query = { userId };
    if (unreadOnly) query.isRead = false;

    const skip = (page - 1) * limit;
    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ userId, isRead: false });

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('meta.fromUserId', 'name email');

    return {
      notifications,
      unreadCount,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    };
  }

  async markAsRead(notificationId, userId) {
    const notification = await Notification.findOne({ _id: notificationId, userId });
    if (!notification) throw Object.assign(new Error('Notification not found'), { statusCode: 404 });

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    await cache.delete(cache.keys.unreadCount(userId));
    return notification;
  }

  async markAllAsRead(userId) {
    await Notification.updateMany(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    await cache.delete(cache.keys.unreadCount(userId));
    return { message: 'All notifications marked as read' };
  }

  async deleteNotification(notificationId, userId) {
    await Notification.findOneAndDelete({ _id: notificationId, userId });
    await cache.deletePattern('notifications:' + userId + ':*');
    return { message: 'Notification deleted' };
  }

  async getUnreadCount(userId) {
    const cacheKey = cache.keys.unreadCount(userId);
    const cached = await cache.get(cacheKey);
    if (cached !== null) return { unreadCount: cached };

    const count = await Notification.countDocuments({ userId, isRead: false });
    await cache.set(cacheKey, count, 60);
    return { unreadCount: count };
  }
}

module.exports = new NotificationService();

      // just added it (boht acha flow haa iss mai seriously)

// Let’s simulate real case.

// User A writes post.
// User B comments.

// Inside comment service:

// 1️⃣ Comment created → MongoDB
// 2️⃣ Post commentCount incremented
// 3️⃣ NotificationService.createNotification() called

// Inside notification service:

// 4️⃣ Notification saved to MongoDB
// 5️⃣ Cache invalidated
// 6️⃣ Socket emits event

// Frontend:

// 7️⃣ Socket receives "notification:new"
// 8️⃣ Notification bell updates
// 9️⃣ Unread badge increments

// All within milliseconds.

// That is modern social platform behavior.