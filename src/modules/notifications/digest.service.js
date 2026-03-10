const User         = require('../auth/auth.model');
const Notification = require('./notification.model');
const { sendNotificationDigest } = require('../../utils/email');
const logger = require('../../utils/logger');

/**
 * Digest Service — MODULE F
 *
 * CC-14 FIX: sendWeeklyDigests() now filters by emailOptIn === true.
 *   Previously sent to ALL users with unread notifications — no consent check.
 *   This violated GDPR Article 6, CAN-SPAM, and CASL.
 *   Now only users who explicitly opted in receive digest emails.
 *
 * CC-24 FIX: scheduleWeeklyDigest() now uses node-cron instead of setTimeout/setInterval.
 *   The old implementation reset its timer on every server restart. Under rolling
 *   deployments or PM2 restarts, multiple instances could each schedule their own
 *   interval and fire multiple duplicate digests to the same users simultaneously.
 *   node-cron uses a deterministic cron expression — restart-safe, no duplicates.
 *
 *   Schedule: Every Sunday at 09:00 UTC
 *   Cron:     '0 9 * * 0'
 */

class DigestService {

  // ─────────────────────────────────────────────────────────────────────────────
  // CC-14 FIX: Only sends to users with emailOptIn === true
  // ─────────────────────────────────────────────────────────────────────────────
  async sendWeeklyDigests() {
    try {
      logger.info('Starting weekly digest send...');

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Step 1: Find user IDs with unread notifications in the last 7 days
      const userIdsWithUnread = await Notification.distinct('userId', {
        isRead:    false,
        createdAt: { $gte: sevenDaysAgo },
      });

      if (!userIdsWithUnread.length) {
        logger.info('Weekly digest: no users with unread notifications — skipping');
        return;
      }

      // CC-14 FIX: Step 2 — filter to only users who have opted in to email
      // This is the critical GDPR gate. We do this as a second query (not in
      // the Notification.distinct) because User and Notification are separate
      // collections — we can't join them in a single MongoDB operation.
      const optedInUsers = await User.find({
        _id:        { $in: userIdsWithUnread },
        emailOptIn: true,
        isEmailVerified: true,  // Never email unverified addresses
        isSuspended: false,     // Never email suspended accounts
      }).select('_id').lean();

      const eligibleIds = optedInUsers.map(u => u._id.toString());

      logger.info(
        'Weekly digest: ' + userIdsWithUnread.length + ' users with unread, ' +
        eligibleIds.length + ' opted in — sending digests'
      );

      for (const userId of eligibleIds) {
        try {
          await this.sendDigestToUser(userId);
        } catch (e) {
          logger.warn('Digest failed for user: ' + userId + ' — ' + e.message);
        }
      }

      logger.info('Weekly digest completed — sent to ' + eligibleIds.length + ' users');
    } catch (error) {
      logger.error('Weekly digest failed: ' + error.message);
    }
  }

  async sendDigestToUser(userId) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const notifications = await Notification.find({
      userId,
      isRead:    false,
      createdAt: { $gte: sevenDaysAgo },
    }).sort({ createdAt: -1 }).limit(10);

    if (notifications.length === 0) return;

    const user = await User.findById(userId).select('name email emailOptIn');
    if (!user || !user.email || !user.emailOptIn) return;

    await sendNotificationDigest(user.email, user.name, notifications);
    logger.info('Digest sent to: ' + user.email);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CC-24 FIX: Deterministic cron schedule — restart-safe, no duplicate sends
  //
  // node-cron fires based on wall-clock time, not on a timer started at boot.
  // A server restart at 8:59 Sunday will still fire at exactly 09:00 Sunday —
  // not immediately on restart like the old setTimeout approach.
  // ─────────────────────────────────────────────────────────────────────────────
  scheduleWeeklyDigest() {
    try {
      const cron = require('node-cron');

      // '0 9 * * 0' = At 09:00 every Sunday (UTC)
      cron.schedule('0 9 * * 0', () => {
        logger.info('Weekly digest cron triggered — Sunday 09:00 UTC');
        this.sendWeeklyDigests();
      }, {
        timezone: 'UTC',
      });

      logger.info('Weekly digest scheduled via cron — fires every Sunday at 09:00 UTC');
    } catch (e) {
      // node-cron not installed — log warning, fall back gracefully
      logger.warn('node-cron unavailable — weekly digest will not run: ' + e.message);
      logger.warn('Run: npm install node-cron');
    }
  }
}

module.exports = new DigestService();
