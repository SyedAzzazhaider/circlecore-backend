const express = require('express');
const router = express.Router();
const profileController = require('./profile.controller');
const onlineController = require('./online.controller');
const { authenticate } = require('../../middleware/authenticate');
const validate = require('../../middleware/validate');
const { updateProfileValidator } = require('./profile.validators');
const reputationService = require('./reputation.service'); // BUG 5 FIX — expose reputation summary
router.get(
  '/me',
  authenticate,
  profileController.getMyProfile
);

router.put(
  '/me',
  authenticate,
  updateProfileValidator,
  validate,
  profileController.updateMyProfile
);

router.put(
  '/me/avatar',
  authenticate,
  profileController.updateAvatar
);

router.get(
  '/user/:userId',
  authenticate,
  profileController.getProfileByUserId
);

router.get(
  '/public/:userId',
  profileController.getPublicProfile // intentionally public — guest preview per document
);
router.get(
  '/reputation/:userId',
  authenticate,
  async (req, res, next) => {
    try {
      const summary = await reputationService.getReputationSummary(req.params.userId);
      return res.status(200).json({ success: true, data: summary });
    } catch (error) {
      next(error);
    }
  }
);
// ─────────────────────────────────────────────────────────────────────────────

// ─── ONLINE PRESENCE ROUTES ───────────────────────────────────────────────────

router.get(
  '/online/users',
  authenticate,
  onlineController.getOnlineUsers
);

router.get(
  '/online/:userId',
  authenticate,
  onlineController.isUserOnline
);

module.exports = router;