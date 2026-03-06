const express = require('express');
const router = express.Router();
const moderationController = require('./moderation.controller');
const { authenticate } = require('../../middleware/authenticate');
const { checkSessionTimeout } = require('../../middleware/sessionTimeout');
const validate = require('../../middleware/validate');
const { moderationLimiter, flagLimiter } = require('../../middleware/rateLimiter');
const {
  submitFlagValidator,
  reviewFlagValidator,
  removeContentValidator,
  issueWarningValidator,
  suspendUserValidator,
  unsuspendUserValidator,
  banFromCommunityValidator,
  unbanFromCommunityValidator,
  blockUserValidator,
} = require('./moderation.validators');

/**
 * Moderation Routes
 * Document requirement: MODULE H — Moderation & Safety
 *
 * Route protection levels:
 * - Public: none
 * - Member: authenticate only
 * - Moderator: authenticate + requireModerator
 * - Admin: authenticate + requireAdmin
 */

const protectedMiddleware = [authenticate, checkSessionTimeout];

// ── Role guards ────────────────────────────────────────────────────────────────
const requireModerator = (req, res, next) => {
  if (!['moderator', 'admin', 'super_admin'].includes(req.user?.role)) {
    return res.status(403).json({ success: false, message: 'Moderator access required' });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!['admin', 'super_admin'].includes(req.user?.role)) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

// ── Flag routes ────────────────────────────────────────────────────────────────

// Any member can submit a flag
router.post(
  '/flags',
  ...protectedMiddleware,
  flagLimiter,
  submitFlagValidator,
  validate,
  moderationController.submitFlag.bind(moderationController)
);

// Moderator review queue
router.get(
  '/flags',
  ...protectedMiddleware,
  requireModerator,
  moderationController.getReviewQueue.bind(moderationController)
);

// Review a specific flag
router.patch(
  '/flags/:flagId/review',
  ...protectedMiddleware,
  requireModerator,
  reviewFlagValidator,
  validate,
  moderationController.reviewFlag.bind(moderationController)
);

// ── Content removal routes ─────────────────────────────────────────────────────
router.delete(
  '/content/:contentType/:contentId',
  ...protectedMiddleware,
  requireModerator,
  removeContentValidator,
  validate,
  moderationController.removeContent.bind(moderationController)
);

// ── Warning routes ─────────────────────────────────────────────────────────────
router.post(
  '/warnings',
  ...protectedMiddleware,
  requireModerator,
  moderationLimiter,
  issueWarningValidator,
  validate,
  moderationController.issueWarning.bind(moderationController)
);

router.get(
  '/warnings/:userId',
  ...protectedMiddleware,
  requireModerator,
  moderationController.getUserWarnings.bind(moderationController)
);

// ── Suspension routes ──────────────────────────────────────────────────────────
router.post(
  '/suspend',
  ...protectedMiddleware,
  requireModerator,
  moderationLimiter,
  suspendUserValidator,
  validate,
  moderationController.suspendUser.bind(moderationController)
);

router.post(
  '/unsuspend',
  ...protectedMiddleware,
  requireModerator,
  unsuspendUserValidator,
  validate,
  moderationController.unsuspendUser.bind(moderationController)
);

// ── Blocklist routes — community bans ─────────────────────────────────────────
router.post(
  '/ban',
  ...protectedMiddleware,
  requireModerator,
  moderationLimiter,
  banFromCommunityValidator,
  validate,
  moderationController.banFromCommunity.bind(moderationController)
);

router.post(
  '/unban',
  ...protectedMiddleware,
  requireModerator,
  unbanFromCommunityValidator,
  validate,
  moderationController.unbanFromCommunity.bind(moderationController)
);

// ── Blocklist routes — user-to-user blocks ────────────────────────────────────
router.post(
  '/block',
  ...protectedMiddleware,
  blockUserValidator,
  validate,
  moderationController.blockUser.bind(moderationController)
);

router.post(
  '/unblock',
  ...protectedMiddleware,
  blockUserValidator,
  validate,
  moderationController.unblockUser.bind(moderationController)
);

router.get(
  '/blocked',
  ...protectedMiddleware,
  moderationController.getBlockedUsers.bind(moderationController)
);

// ── Audit log routes ───────────────────────────────────────────────────────────
router.get(
  '/audit',
  ...protectedMiddleware,
  requireModerator,
  moderationController.getAuditLogs.bind(moderationController)
);

// ── Stats ──────────────────────────────────────────────────────────────────────
router.get(
  '/stats',
  ...protectedMiddleware,
  requireModerator,
  moderationController.getStats.bind(moderationController)
);

module.exports = router;