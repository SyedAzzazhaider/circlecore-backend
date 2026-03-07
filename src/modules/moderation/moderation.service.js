const Flag = require('./flag.model');
const Warning = require('./warning.model');
const AuditLog = require('./auditLog.model');
const Blocklist = require('./blocklist.model');
const User = require('../auth/auth.model');
const Post = require('../posts/post.model');
const Comment = require('../comments/comment.model');
const Community = require('../communities/community.model');
const notificationService = require('../notifications/notification.service');
const logger = require('../../utils/logger');

/**
 * Moderation Service
 * Document requirement: MODULE H — Moderation & Safety
 */
class ModerationService {

  // ─────────────────────────────────────────────────────────────────────────────
  // FLAGS — Document requirement: Content flags + Moderator review queue
  // ─────────────────────────────────────────────────────────────────────────────

  async submitFlag({ contentType, contentId, flaggedBy, communityId, reason, description }) {
    await this._validateContentExists(contentType, contentId);

    const existing = await Flag.findOne({ flaggedBy, contentType, contentId });
    if (existing) {
      throw Object.assign(new Error('You have already flagged this content'), { statusCode: 409 });
    }

    const flag = await Flag.create({
      contentType, contentId,
      flaggedBy,
      communityId: communityId || null,
      reason,
      description: description || '',
      status: 'pending',
    });

    logger.info(`Flag submitted: ${contentType}/${contentId} by user ${flaggedBy}`);
    return flag;
  }

  async getReviewQueue({ communityId, status = 'pending', page = 1, limit = 20 } = {}) {
    const query = {};
    if (status) query.status = status;
    if (communityId) query.communityId = communityId;

    const skip = (page - 1) * limit;
    const [flags, total] = await Promise.all([
      Flag.find(query)
        .populate('flaggedBy', 'name email role')
        .populate('reviewedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Flag.countDocuments(query),
    ]);

    return { flags, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async reviewFlag({ flagId, moderatorId, moderatorRole, status, resolution, resolutionNote, ipAddress, userAgent }) {
    const flag = await Flag.findById(flagId);
    if (!flag) throw Object.assign(new Error('Flag not found'), { statusCode: 404 });

    if (['resolved', 'dismissed'].includes(flag.status)) {
      throw Object.assign(new Error('Flag is already resolved'), { statusCode: 400 });
    }

    flag.status = status;
    flag.reviewedBy = moderatorId;
    flag.reviewedAt = new Date();
    flag.resolution = resolution || 'no_action';
    flag.resolutionNote = resolutionNote || '';
    await flag.save();

    await this._createAuditLog({
      performedBy: moderatorId,
      performedByRole: moderatorRole,
      action: status === 'dismissed' ? 'flag.dismissed' : 'flag.resolved',
      targetType: 'flag',
      targetId: flag._id,
      communityId: flag.communityId,
      details: { flagId, resolution, resolutionNote, contentType: flag.contentType, contentId: flag.contentId },
      ipAddress, userAgent,
    });

    logger.info(`Flag ${flagId} ${status} by moderator ${moderatorId}`);
    return flag;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CONTENT REMOVAL
  // ─────────────────────────────────────────────────────────────────────────────

  async removeContent({ contentType, contentId, moderatorId, moderatorRole, reason, flagId, communityId, ipAddress, userAgent }) {
    if (contentType === 'post') {
      const post = await Post.findById(contentId);
      if (!post) throw Object.assign(new Error('Post not found'), { statusCode: 404 });
      post.isRemoved = true;
      post.removedBy = moderatorId;
      post.removedReason = reason;
      post.removedAt = new Date();
      await post.save();
    } else if (contentType === 'comment') {
      const comment = await Comment.findById(contentId);
      if (!comment) throw Object.assign(new Error('Comment not found'), { statusCode: 404 });
      comment.isRemoved = true;
      comment.removedBy = moderatorId;
      comment.removedReason = reason;
      comment.removedAt = new Date();
      await comment.save();
    } else {
      throw Object.assign(new Error('Cannot remove this content type'), { statusCode: 400 });
    }

    await this._createAuditLog({
      performedBy: moderatorId,
      performedByRole: moderatorRole,
      action: 'content.removed',
      targetType: contentType,
      targetId: contentId,
      communityId: communityId || null,
      details: { reason, flagId },
      ipAddress, userAgent,
    });

    logger.info(`Content removed: ${contentType}/${contentId} by moderator ${moderatorId}`);
    return { contentType, contentId, removed: true };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // WARNINGS — Document requirement: Member warnings
  // ─────────────────────────────────────────────────────────────────────────────

  async issueWarning({ userId, issuedBy, issuedByRole, communityId, reason, severity, relatedContentType, relatedContentId, flagId, ipAddress, userAgent }) {
    const user = await User.findById(userId);
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

    const warning = await Warning.create({
      userId, issuedBy,
      communityId: communityId || null,
      reason,
      severity: severity || 'minor',
      relatedContentType: relatedContentType || null,
      relatedContentId: relatedContentId || null,
      flagId: flagId || null,
    });

    await User.findByIdAndUpdate(userId, { $inc: { warningCount: 1 } });

    await this._createAuditLog({
      performedBy: issuedBy,
      performedByRole: issuedByRole,
      action: 'warning.issued',
      targetType: 'user',
      targetId: userId,
      communityId: communityId || null,
      details: { warningId: warning._id, reason, severity },
      ipAddress, userAgent,
    });

    // FIX: use valid enum value 'moderator_action' from notification.model.js
    try {
      await notificationService.createNotification({
        userId,
        type: 'moderator_action',
        title: 'You have received a warning',
        message: reason,
        meta: {},
      });
    } catch (e) {
      logger.warn('Warning notification failed: ' + e.message);
    }

    logger.info(`Warning issued to user ${userId} by ${issuedBy} severity: ${severity}`);
    return warning;
  }

  async getUserWarnings(userId, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const [warnings, total] = await Promise.all([
      Warning.find({ userId })
        .populate('issuedBy', 'name role')
        .populate('communityId', 'name slug')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Warning.countDocuments({ userId }),
    ]);
    return { warnings, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SUSPENSIONS — Document requirement: Temporary suspensions
  // ─────────────────────────────────────────────────────────────────────────────

  async suspendUser({ userId, moderatorId, moderatorRole, reason, suspendedUntil, ipAddress, userAgent }) {
    const user = await User.findById(userId).select('+refreshTokens');
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
    if (user.isSuspended) throw Object.assign(new Error('User is already suspended'), { statusCode: 400 });

    if (['moderator', 'admin', 'super_admin'].includes(user.role) && moderatorRole !== 'super_admin') {
      throw Object.assign(new Error('Insufficient permissions to suspend this user'), { statusCode: 403 });
    }

    user.isSuspended = true;
    user.suspendedReason = reason;
    user.suspendedUntil = suspendedUntil || null;
    user.refreshTokens = [];
    await user.save();

    await this._createAuditLog({
      performedBy: moderatorId,
      performedByRole: moderatorRole,
      action: 'user.suspended',
      targetType: 'user',
      targetId: userId,
      details: { reason, suspendedUntil, permanent: !suspendedUntil },
      ipAddress, userAgent,
    });

    // FIX: use valid enum value 'moderator_action' + correct title/message for suspension
    try {
      const durationText = suspendedUntil
        ? `until ${new Date(suspendedUntil).toLocaleDateString()}`
        : 'permanently';
      await notificationService.createNotification({
        userId,
        type: 'moderator_action',
        title: 'Your account has been suspended',
        message: `Your account has been suspended ${durationText}. Reason: ${reason}`,
        meta: {},
      });
    } catch (e) {
      logger.warn('Suspension notification failed: ' + e.message);
    }

    logger.info(`User ${userId} suspended by ${moderatorId} until ${suspendedUntil || 'permanent'}`);
    return { userId, suspended: true, suspendedUntil };
  }

  async unsuspendUser({ userId, moderatorId, moderatorRole, ipAddress, userAgent }) {
    const user = await User.findById(userId);
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
    if (!user.isSuspended) throw Object.assign(new Error('User is not suspended'), { statusCode: 400 });

    user.isSuspended = false;
    user.suspendedReason = undefined;
    user.suspendedUntil = undefined;
    await user.save();

    await this._createAuditLog({
      performedBy: moderatorId,
      performedByRole: moderatorRole,
      action: 'user.unsuspended',
      targetType: 'user',
      targetId: userId,
      details: {},
      ipAddress, userAgent,
    });

    logger.info(`User ${userId} unsuspended by ${moderatorId}`);
    return { userId, suspended: false };
  }

  async liftExpiredSuspensions() {
    const now = new Date();
    const result = await User.updateMany(
      { isSuspended: true, suspendedUntil: { $lte: now } },
      { $set: { isSuspended: false }, $unset: { suspendedReason: '', suspendedUntil: '' } }
    );
    if (result.modifiedCount > 0) {
      logger.info(`Auto-lifted ${result.modifiedCount} expired suspension(s)`);
    }
    return result.modifiedCount;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BLOCKLIST — Document requirement: Blocklists
  // ─────────────────────────────────────────────────────────────────────────────

  async banFromCommunity({ userId, moderatorId, moderatorRole, communityId, reason, expiresAt, flagId, ipAddress, userAgent }) {
    const user = await User.findById(userId);
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

    const community = await Community.findById(communityId);
    if (!community) throw Object.assign(new Error('Community not found'), { statusCode: 404 });

    const existing = await Blocklist.findOne({ type: 'community_ban', blockedUserId: userId, communityId, isActive: true });
    if (existing) throw Object.assign(new Error('User is already banned from this community'), { statusCode: 409 });

    const ban = await Blocklist.create({
      type: 'community_ban',
      blockedUserId: userId,
      blockedBy: moderatorId,
      communityId,
      reason: reason || '',
      expiresAt: expiresAt || null,
      flagId: flagId || null,
    });

    await Community.findByIdAndUpdate(communityId, { $pull: { members: userId } });

    await this._createAuditLog({
      performedBy: moderatorId,
      performedByRole: moderatorRole,
      action: 'user.banned',
      targetType: 'user',
      targetId: userId,
      communityId,
      details: { reason, expiresAt, banId: ban._id },
      ipAddress, userAgent,
    });

    logger.info(`User ${userId} banned from community ${communityId} by ${moderatorId}`);
    return ban;
  }

  async unbanFromCommunity({ userId, moderatorId, moderatorRole, communityId, ipAddress, userAgent }) {
    const ban = await Blocklist.findOne({ type: 'community_ban', blockedUserId: userId, communityId, isActive: true });
    if (!ban) throw Object.assign(new Error('No active ban found'), { statusCode: 404 });

    ban.isActive = false;
    await ban.save();

    await this._createAuditLog({
      performedBy: moderatorId,
      performedByRole: moderatorRole,
      action: 'user.unbanned',
      targetType: 'user',
      targetId: userId,
      communityId,
      details: { banId: ban._id },
      ipAddress, userAgent,
    });

    logger.info(`User ${userId} unbanned from community ${communityId} by ${moderatorId}`);
    return { userId, communityId, unbanned: true };
  }

  async blockUser({ blockerId, blockedUserId }) {
    if (blockerId.toString() === blockedUserId.toString()) {
      throw Object.assign(new Error('Cannot block yourself'), { statusCode: 400 });
    }

    const user = await User.findById(blockedUserId);
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

    const existing = await Blocklist.findOne({ type: 'user_block', blockedBy: blockerId, blockedUserId, isActive: true });
    if (existing) throw Object.assign(new Error('User is already blocked'), { statusCode: 409 });

    const block = await Blocklist.create({
      type: 'user_block',
      blockedUserId,
      blockedBy: blockerId,
      communityId: null,
    });

    logger.info(`User ${blockedUserId} blocked by ${blockerId}`);
    return block;
  }

  async unblockUser({ blockerId, blockedUserId }) {
    const block = await Blocklist.findOne({ type: 'user_block', blockedBy: blockerId, blockedUserId, isActive: true });
    if (!block) throw Object.assign(new Error('No active block found'), { statusCode: 404 });

    block.isActive = false;
    await block.save();

    logger.info(`User ${blockedUserId} unblocked by ${blockerId}`);
    return { blockedUserId, unblocked: true };
  }

  async getBlockedUsers(blockerId) {
    return Blocklist.find({ type: 'user_block', blockedBy: blockerId, isActive: true })
      .populate('blockedUserId', 'name email')
      .sort({ createdAt: -1 });
  }

  async isUserBanned(userId, communityId) {
    const ban = await Blocklist.findOne({
      type: 'community_ban',
      blockedUserId: userId,
      communityId,
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });
    return !!ban;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AUDIT LOGS — Document requirement: Audit trails + Moderator actions
  // ─────────────────────────────────────────────────────────────────────────────

  async getAuditLogs({ communityId, performedBy, targetType, targetId, action, page = 1, limit = 20 } = {}) {
    const query = {};
    if (communityId) query.communityId = communityId;
    if (performedBy) query.performedBy = performedBy;
    if (targetType) query.targetType = targetType;
    if (targetId) query.targetId = targetId;
    if (action) query.action = action;

    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .populate('performedBy', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AuditLog.countDocuments(query),
    ]);

    return { logs, pagination: { total, page, limit, pages: Math.ceil(total / limit) } };
  }

  async getModerationStats(communityId = null) {
    const baseQuery = communityId ? { communityId } : {};

    const [pendingFlags, resolvedToday, activeWarnings, activeBans] = await Promise.all([
      Flag.countDocuments({ ...baseQuery, status: 'pending' }),
      Flag.countDocuments({
        ...baseQuery,
        status: { $in: ['resolved', 'dismissed'] },
        reviewedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
      Warning.countDocuments({ isActive: true, ...(communityId ? { communityId } : {}) }),
      Blocklist.countDocuments({ type: 'community_ban', isActive: true, ...(communityId ? { communityId } : {}) }),
    ]);

    return { pendingFlags, resolvedToday, activeWarnings, activeBans };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  async _validateContentExists(contentType, contentId) {
    let doc;
    if (contentType === 'post') doc = await Post.findById(contentId).select('_id');
    else if (contentType === 'comment') doc = await Comment.findById(contentId).select('_id');
    else if (contentType === 'user') doc = await User.findById(contentId).select('_id');
    else if (contentType === 'community') doc = await Community.findById(contentId).select('_id');

    if (!doc) throw Object.assign(new Error(`${contentType} not found`), { statusCode: 404 });
    return doc;
  }

  async _createAuditLog({ performedBy, performedByRole, action, targetType, targetId, communityId, details, ipAddress, userAgent }) {
    try {
      await AuditLog.create({
        performedBy, performedByRole, action, targetType, targetId,
        communityId: communityId || null,
        details: details || {},
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      });
    } catch (e) {
      // Audit log failures must never break the primary action
      logger.error('AuditLog creation failed: ' + e.message);
    }
  }
}

module.exports = new ModerationService();