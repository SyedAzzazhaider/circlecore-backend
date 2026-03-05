const User = require('../auth/auth.model');
const Notification = require('./notification.model');
const { sendNotificationDigest } = require('../../utils/email');
const logger = require('../../utils/logger');

/**
 * Digest Service
 * Document requirement: MODULE F — Email digests
 * Sends weekly digest of unread notifications to all users
 */
class DigestService {

  /**
   * Send weekly digest to all users who have unread notifications
   * Called by a scheduled job (weekly)
   */
  async sendWeeklyDigests() {
    try {
      logger.info('Starting weekly digest send...');

      // Find all users with unread notifications from the past 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const usersWithUnread = await Notification.distinct('userId', {
        isRead: false,
        createdAt: { $gte: sevenDaysAgo },
      });

      logger.info('Sending digest to ' + usersWithUnread.length + ' users');

      for (const userId of usersWithUnread) {
        try {
          await this.sendDigestToUser(userId);
        } catch (e) {
          logger.warn('Digest failed for user: ' + userId + ' — ' + e.message);
        }
      }

      logger.info('Weekly digest completed');
    } catch (error) {
      logger.error('Weekly digest failed: ' + error.message);
    }
  }

  /**
   * Send digest to a single user
   */
  async sendDigestToUser(userId) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const notifications = await Notification.find({
      userId,
      isRead: false,
      createdAt: { $gte: sevenDaysAgo },
    }).sort({ createdAt: -1 }).limit(10);

    if (notifications.length === 0) return;

    const user = await User.findById(userId).select('name email');
    if (!user || !user.email) return;

    await sendNotificationDigest(user.email, user.name, notifications);
    logger.info('Digest sent to: ' + user.email);
  }

  /**
   * Schedule weekly digest — runs every Sunday at 9AM UTC
   * Uses setInterval as a lightweight scheduler
   * Production: replace with cron job or AWS EventBridge
   */
  scheduleWeeklyDigest() {
    const now = new Date();
    const nextSunday = new Date();
    nextSunday.setUTCDate(now.getUTCDate() + (7 - now.getUTCDay()) % 7 || 7);
    nextSunday.setUTCHours(9, 0, 0, 0);

    const msUntilFirst = nextSunday - now;

    logger.info('Weekly digest scheduled — first run in ' + Math.round(msUntilFirst / 3600000) + ' hours');

    setTimeout(() => {
      this.sendWeeklyDigests();
      // Then repeat every 7 days
      setInterval(() => this.sendWeeklyDigests(), 7 * 24 * 60 * 60 * 1000);
    }, msUntilFirst);
  }
}

module.exports = new DigestService();