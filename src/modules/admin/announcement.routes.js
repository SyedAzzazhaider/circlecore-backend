const express = require('express');
const router = express.Router();
const announcementController = require('./announcement.controller');
const { authenticate, authorize } = require('../../middleware/authenticate');

/**
 * Announcement Routes
 * Document requirement: MODULE F — Admin announcements
 */

// Community announcement — admin or moderator of that community
router.post(
  '/community/:communityId',
  authenticate,
  announcementController.sendCommunityAnnouncement
);

// Platform-wide announcement — super_admin only
router.post(
  '/platform',
  authenticate,
  authorize('super_admin'),
  announcementController.sendPlatformAnnouncement
);

module.exports = router;