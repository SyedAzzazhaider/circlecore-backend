const moderationService = require('./moderation.service');
const ApiResponse = require('../../utils/apiResponse');
const logger = require('../../utils/logger');

/**
 * Moderation Controller
 * Document requirement: MODULE H — Moderation & Safety
 */
class ModerationController {

  // ── Flags ────────────────────────────────────────────────────────────────────

  async submitFlag(req, res) {
    try {
      const { contentType, contentId, communityId, reason, description } = req.body;
      const flag = await moderationService.submitFlag({
        contentType, contentId,
        flaggedBy: req.user._id,
        communityId: communityId || null,
        reason, description,
      });
      return ApiResponse.created(res, { flag }, 'Content flagged successfully');
    } catch (e) {
      return ApiResponse.error(res, e.message, e.statusCode || 500);
    }
  }

  async getReviewQueue(req, res) {
    try {
      const { communityId, status, page, limit } = req.query;
      const result = await moderationService.getReviewQueue({
        communityId: communityId || null,
        status: status || 'pending',
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
      });
      return ApiResponse.success(res, result, 'Review queue fetched');
    } catch (e) {
      return ApiResponse.error(res, e.message, e.statusCode || 500);
    }
  }

  async reviewFlag(req, res) {
    try {
      const { status, resolution, resolutionNote } = req.body;
      const flag = await moderationService.reviewFlag({
        flagId: req.params.flagId,
        moderatorId: req.user._id,
        moderatorRole: req.user.role,
        status, resolution, resolutionNote,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });
      return ApiResponse.success(res, { flag }, 'Flag reviewed');
    } catch (e) {
      return ApiResponse.error(res, e.message, e.statusCode || 500);
    }
  }

  // ── Content Removal ──────────────────────────────────────────────────────────

  async removeContent(req, res) {
    try {
      const { contentType, contentId } = req.params;
      const { reason, flagId, communityId } = req.body;
      const result = await moderationService.removeContent({
        contentType, contentId,
        moderatorId: req.user._id,
        moderatorRole: req.user.role,
        reason,
        flagId: flagId || null,
        communityId: communityId || null,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });
      return ApiResponse.success(res, result, 'Content removed');
    } catch (e) {
      return ApiResponse.error(res, e.message, e.statusCode || 500);
    }
  }

  // ── Warnings ─────────────────────────────────────────────────────────────────

  async issueWarning(req, res) {
    try {
      const { userId, communityId, reason, severity, relatedContentType, relatedContentId, flagId } = req.body;
      const warning = await moderationService.issueWarning({
        userId,
        issuedBy: req.user._id,
        issuedByRole: req.user.role,
        communityId: communityId || null,
        reason,
        severity: severity || 'minor',
        relatedContentType: relatedContentType || null,
        relatedContentId: relatedContentId || null,
        flagId: flagId || null,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });
      return ApiResponse.created(res, { warning }, 'Warning issued');
    } catch (e) {
      return ApiResponse.error(res, e.message, e.statusCode || 500);
    }
  }

  async getUserWarnings(req, res) {
    try {
      const { page, limit } = req.query;
      const result = await moderationService.getUserWarnings(req.params.userId, {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
      });
      return ApiResponse.success(res, result, 'Warnings fetched');
    } catch (e) {
      return ApiResponse.error(res, e.message, e.statusCode || 500);
    }
  }

  // ── Suspensions ──────────────────────────────────────────────────────────────

  async suspendUser(req, res) {
    try {
      const { userId, reason, suspendedUntil } = req.body;
      const result = await moderationService.suspendUser({
        userId,
        moderatorId: req.user._id,
        moderatorRole: req.user.role,
        reason,
        suspendedUntil: suspendedUntil ? new Date(suspendedUntil) : null,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });
      return ApiResponse.success(res, result, 'User suspended');
    } catch (e) {
      return ApiResponse.error(res, e.message, e.statusCode || 500);
    }
  }

  async unsuspendUser(req, res) {
    try {
      const { userId } = req.body;
      const result = await moderationService.unsuspendUser({
        userId,
        moderatorId: req.user._id,
        moderatorRole: req.user.role,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });
      return ApiResponse.success(res, result, 'User unsuspended');
    } catch (e) {
      return ApiResponse.error(res, e.message, e.statusCode || 500);
    }
  }

  // ── Blocklist ─────────────────────────────────────────────────────────────────

  async banFromCommunity(req, res) {
    try {
      const { userId, communityId, reason, expiresAt, flagId } = req.body;
      const ban = await moderationService.banFromCommunity({
        userId,
        moderatorId: req.user._id,
        moderatorRole: req.user.role,
        communityId, reason,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        flagId: flagId || null,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });
      return ApiResponse.created(res, { ban }, 'User banned from community');
    } catch (e) {
      return ApiResponse.error(res, e.message, e.statusCode || 500);
    }
  }

  async unbanFromCommunity(req, res) {
    try {
      const { userId, communityId } = req.body;
      const result = await moderationService.unbanFromCommunity({
        userId,
        moderatorId: req.user._id,
        moderatorRole: req.user.role,
        communityId,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      });
      return ApiResponse.success(res, result, 'User unbanned from community');
    } catch (e) {
      return ApiResponse.error(res, e.message, e.statusCode || 500);
    }
  }

  async blockUser(req, res) {
    try {
      const { userId } = req.body;
      const block = await moderationService.blockUser({
        blockerId: req.user._id,
        blockedUserId: userId,
      });
      return ApiResponse.created(res, { block }, 'User blocked');
    } catch (e) {
      return ApiResponse.error(res, e.message, e.statusCode || 500);
    }
  }

  async unblockUser(req, res) {
    try {
      const { userId } = req.body;
      const result = await moderationService.unblockUser({
        blockerId: req.user._id,
        blockedUserId: userId,
      });
      return ApiResponse.success(res, result, 'User unblocked');
    } catch (e) {
      return ApiResponse.error(res, e.message, e.statusCode || 500);
    }
  }

  async getBlockedUsers(req, res) {
    try {
      const blocks = await moderationService.getBlockedUsers(req.user._id);
      return ApiResponse.success(res, { blocks }, 'Blocked users fetched');
    } catch (e) {
      return ApiResponse.error(res, e.message, e.statusCode || 500);
    }
  }

  // ── Audit Logs ────────────────────────────────────────────────────────────────

  async getAuditLogs(req, res) {
    try {
      const { communityId, performedBy, targetType, targetId, action, page, limit } = req.query;
      const result = await moderationService.getAuditLogs({
        communityId: communityId || null,
        performedBy: performedBy || null,
        targetType: targetType || null,
        targetId: targetId || null,
        action: action || null,
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
      });
      return ApiResponse.success(res, result, 'Audit logs fetched');
    } catch (e) {
      return ApiResponse.error(res, e.message, e.statusCode || 500);
    }
  }

  async getStats(req, res) {
    try {
      const { communityId } = req.query;
      const stats = await moderationService.getModerationStats(communityId || null);
      return ApiResponse.success(res, { stats }, 'Moderation stats fetched');
    } catch (e) {
      return ApiResponse.error(res, e.message, e.statusCode || 500);
    }
  }
}

module.exports = new ModerationController();