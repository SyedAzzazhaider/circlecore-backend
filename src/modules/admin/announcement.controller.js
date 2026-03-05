const NotificationService = require('../notifications/notification.service');
const Community = require('../communities/community.model');
const User = require('../auth/auth.model');
const { sendAnnouncementEmail } = require('../../utils/email');
const ApiResponse = require('../../utils/apiResponse');
const logger = require('../../utils/logger');

/**
 * Announcement Controller
 * Document requirement: MODULE F — Admin announcements
 * Allows admins/moderators to send announcements to all community members
 */
class AnnouncementController {

  /**
   * Send announcement to all members of a community
   * POST /api/announcements/community/:communityId
   */
  async sendCommunityAnnouncement(req, res, next) {
    try {
      const { title, message, sendEmail: shouldEmail } = req.body;
      const { communityId } = req.params;

      if (!title || !message) {
        return res.status(400).json({
          success: false,
          message: 'Title and message are required',
        });
      }

      const community = await Community.findById(communityId);
      if (!community) {
        return res.status(404).json({ success: false, message: 'Community not found' });
      }

      // Only admins and moderators of this community can send announcements
      const memberRole = community.getMemberRole(req.user._id);
      if (!memberRole || !['admin', 'moderator'].includes(memberRole)) {
        return res.status(403).json({
          success: false,
          message: 'Only admins and moderators can send announcements',
        });
      }

      const memberIds = community.members.map(m => m.userId);
      let notified = 0;
      let emailed = 0;

      for (const memberId of memberIds) {
        // Skip the sender
        if (memberId.toString() === req.user._id.toString()) continue;

        try {
          // In-app notification
          await NotificationService.createNotification({
            userId: memberId,
            type: 'admin_announcement',
            title: title,
            message: message,
            meta: {
              fromUserId: req.user._id,
              communityId: community._id,
            },
          });
          notified++;

          // Optional email announcement
          if (shouldEmail) {
            const user = await User.findById(memberId).select('name email');
            if (user && user.email) {
              await sendAnnouncementEmail(user.email, user.name, title, message);
              emailed++;
            }
          }
        } catch (e) {
          logger.warn('Announcement failed for member: ' + memberId + ' — ' + e.message);
        }
      }

      logger.info('Announcement sent to ' + notified + ' members in community: ' + communityId);

      return ApiResponse.success(res, {
        notified,
        emailed: shouldEmail ? emailed : 0,
        community: community.name,
      }, 'Announcement sent successfully');

    } catch (error) { next(error); }
  }

  /**
   * Send platform-wide announcement — super_admin only
   * POST /api/announcements/platform
   */
  async sendPlatformAnnouncement(req, res, next) {
    try {
      const { title, message, sendEmail: shouldEmail } = req.body;

      if (!title || !message) {
        return res.status(400).json({
          success: false,
          message: 'Title and message are required',
        });
      }

      const users = await User.find({ isSuspended: false }).select('_id name email');
      let notified = 0;
      let emailed = 0;

      for (const user of users) {
        if (user._id.toString() === req.user._id.toString()) continue;

        try {
          await NotificationService.createNotification({
            userId: user._id,
            type: 'admin_announcement',
            title: title,
            message: message,
            meta: { fromUserId: req.user._id },
          });
          notified++;

          if (shouldEmail && user.email) {
            await sendAnnouncementEmail(user.email, user.name, title, message);
            emailed++;
          }
        } catch (e) {
          logger.warn('Platform announcement failed for user: ' + user._id);
        }
      }

      logger.info('Platform announcement sent to ' + notified + ' users');

      return ApiResponse.success(res, {
        notified,
        emailed: shouldEmail ? emailed : 0,
      }, 'Platform announcement sent successfully');

    } catch (error) { next(error); }
  }
}

module.exports = new AnnouncementController();