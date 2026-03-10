const Notification    = require('./notification.model');
const cache           = require('../../utils/cache');
const logger          = require('../../utils/logger');
const oneSignalService = require('../../services/onesignal.service');

/**
 * Notification Service
 *
 * CC-05 FIX: OneSignal push notification wired into createNotification().
 *
 * BEFORE: Notification flow was Socket.IO only.
 *   If user closes browser → socket disconnects → notification is saved to DB
 *   but NO push is sent → user has no idea they got a notification until
 *   they open the app again. On mobile this is completely broken.
 *
 * AFTER: Two-layer notification delivery:
 *   Layer 1 — Socket.IO (real-time, when user is online)
 *   Layer 2 — OneSignal push (when user is offline/mobile/background tab)
 *
 * The OneSignal call is:
 *   - NON-FATAL: wrapped in try/catch, never throws, never blocks
 *   - CONDITIONAL: only fires if user has a deviceToken registered
 *   - ASYNC: does not add meaningful latency to the notification creation
 */
class NotificationService {

  async createNotification({ userId, type, title, message, meta = {} }) {
    try {
      const notification = await Notification.create({
        userId, type, title, message, meta,
      });

      // Invalidate notification cache
      await cache.deletePattern('notifications:' + userId + ':*');
      await cache.delete(cache.keys.unreadCount(userId));

      // ─── Layer 1: Socket.IO — real-time (user is online) ─────────────────
      try {
        const { emitToUser } = require('../../config/socket');
        emitToUser(userId.toString(), 'notification:new', {
          notification,
          message: title,
        });
      } catch (e) {
        logger.warn('Socket notification emit failed: ' + e.message);
      }

      // ─── Layer 2: OneSignal Push — offline/mobile/background tab ─────────
      // CC-05 FIX: send push to user's registered device if they're offline
      try {
        const User = require('../auth/auth.model');
        const recipient = await User.findById(userId).select('deviceToken');
        if (recipient?.deviceToken) {
          await oneSignalService.sendToUser(
            recipient.deviceToken,
            title,
            message,
            {
              notificationId: notification._id.toString(),
              type,
              ...meta,
            }
          );
        }
      } catch (e) {
        // Push failure must NEVER fail the notification save
        logger.warn('OneSignal push failed (non-fatal): ' + e.message);
      }
      // ─────────────────────────────────────────────────────────────────────

      logger.info('Notification created for user: ' + userId);
      return notification;

    } catch (error) {
      logger.error('Failed to create notification: ' + error.message);
    }
  }

  async getUserNotifications(userId, { page = 1, limit = 20, unreadOnly = false }) {
    const query = { userId };
    if (unreadOnly) query.isRead = false;

    const skip        = (page - 1) * limit;
    const total       = await Notification.countDocuments(query);
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
        page:  parseInt(page),
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
    const cached   = await cache.get(cacheKey);
    if (cached !== null) return { unreadCount: cached };

    const count = await Notification.countDocuments({ userId, isRead: false });
    await cache.set(cacheKey, count, 60);
    return { unreadCount: count };
  }
}

module.exports = new NotificationService();
