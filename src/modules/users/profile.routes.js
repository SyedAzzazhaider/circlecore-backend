const express = require('express');
const router  = express.Router();
const profileController = require('./profile.controller');
const onlineController  = require('./online.controller');
const { authenticate }  = require('../../middleware/authenticate');
const validate          = require('../../middleware/validate');
const { updateProfileValidator } = require('./profile.validators');
const reputationService = require('./reputation.service');

// ─── PROFILE CRUD ─────────────────────────────────────────────────────────────

router.get('/me',   authenticate, profileController.getMyProfile);

router.put('/me',
  authenticate,
  updateProfileValidator, validate,
  profileController.updateMyProfile
);

router.put('/me/avatar', authenticate, profileController.updateAvatar);

router.get('/user/:userId',   authenticate, profileController.getProfileByUserId);
router.get('/public/:userId', profileController.getPublicProfile);

router.get('/reputation/:userId',
  authenticate,
  async (req, res, next) => {
    try {
      const summary = await reputationService.getReputationSummary(req.params.userId);
      return res.status(200).json({ success: true, data: summary });
    } catch (error) { next(error); }
  }
);

// ─── ONLINE PRESENCE ──────────────────────────────────────────────────────────

router.get('/online/users',   authenticate, onlineController.getOnlineUsers);
router.get('/online/:userId', authenticate, onlineController.isUserOnline);

// ─── CC-05: DEVICE TOKEN — OneSignal Push Notification Registration ───────────
//
// POST /api/profiles/me/device-token
//   Called by the frontend after OneSignal SDK initializes and returns a
//   subscription/player ID. Stores it on the User document so the server
//   can send push notifications when the user is offline.
//
// DELETE /api/profiles/me/device-token
//   Called on logout. Clears the device token so the signed-out device
//   does not receive push notifications meant for other users.

router.post('/me/device-token',
  authenticate,
  async (req, res, next) => {
    try {
      const { deviceToken, devicePlatform } = req.body;

      if (!deviceToken || typeof deviceToken !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'deviceToken is required and must be a string',
        });
      }

      const validPlatforms = ['web', 'ios', 'android'];
      if (devicePlatform && !validPlatforms.includes(devicePlatform)) {
        return res.status(400).json({
          success: false,
          message: 'devicePlatform must be one of: web, ios, android',
        });
      }

      const User = require('../auth/auth.model');
      await User.findByIdAndUpdate(req.user._id, {
        deviceToken,
        devicePlatform: devicePlatform || 'web',
      });

      return res.status(200).json({
        success: true,
        message: 'Device token registered — push notifications enabled',
      });

    } catch (error) { next(error); }
  }
);

router.delete('/me/device-token',
  authenticate,
  async (req, res, next) => {
    try {
      const User = require('../auth/auth.model');
      await User.findByIdAndUpdate(req.user._id, {
        deviceToken:    null,
        devicePlatform: null,
      });

      return res.status(200).json({
        success: true,
        message: 'Device token removed — push notifications disabled',
      });

    } catch (error) { next(error); }
  }
);

module.exports = router;
