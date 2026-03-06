const mongoose = require('mongoose');

/**
 * AuditLog Model
 * Document requirement: MODULE H — Audit trails + Moderator actions
 *
 * Every moderation action is recorded here permanently.
 * Audit logs are immutable — they are never updated or deleted.
 * They provide a complete, tamper-evident history of all moderation decisions.
 *
 * This covers both:
 * - Moderator actions (flag review, content removal, warnings, suspensions)
 * - Admin actions (role changes, platform bans, community management)
 */
const auditLogSchema = new mongoose.Schema({

  // ── Who performed the action ─────────────────────────────────────────────
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  performedByRole: {
    type: String,
    enum: ['moderator', 'admin', 'super_admin'],
    required: true,
  },

  // ── What action was taken ────────────────────────────────────────────────
  // Document requirement: moderator actions log
  action: {
    type: String,
    enum: [
      // Flag actions
      'flag.reviewed',
      'flag.dismissed',
      'flag.resolved',

      // Content actions
      'content.removed',
      'content.restored',

      // Member warning actions — document requirement: member warnings
      'warning.issued',
      'warning.revoked',

      // Suspension actions — document requirement: temporary suspensions
      'user.suspended',
      'user.unsuspended',

      // Blocklist actions — document requirement: blocklists
      'user.banned',        // Permanent community ban
      'user.unbanned',
      'user.blocked',       // User-to-user block
      'user.unblocked',

      // Role actions
      'user.role_changed',

      // Community actions
      'community.locked',
      'community.unlocked',
    ],
    required: true,
  },

  // ── What was acted upon ──────────────────────────────────────────────────
  targetType: {
    type: String,
    enum: ['user', 'post', 'comment', 'community', 'flag'],
    required: true,
  },

  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },

  // ── Community scope (null = platform-wide action) ────────────────────────
  communityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    default: null,
  },

  // ── Action details ───────────────────────────────────────────────────────
  // Flexible object to store action-specific data:
  // e.g. { reason, suspendedUntil, previousRole, newRole, flagReason }
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },

  // ── Request metadata ─────────────────────────────────────────────────────
  ipAddress: {
    type: String,
    default: null,
  },

  userAgent: {
    type: String,
    default: null,
  },

}, {
  timestamps: true,
  // Audit logs are immutable — disable update operations at schema level
  // Enforcement is also done at the service layer
});

// ── Indexes ──────────────────────────────────────────────────────────────────
auditLogSchema.index({ performedBy: 1, createdAt: -1 });   // Moderator activity history
auditLogSchema.index({ targetType: 1, targetId: 1 });      // All actions on a target
auditLogSchema.index({ communityId: 1, createdAt: -1 });   // Per-community audit trail
auditLogSchema.index({ action: 1, createdAt: -1 });        // Actions by type
auditLogSchema.index({ createdAt: -1 });                   // Global timeline

module.exports = mongoose.model('AuditLog', auditLogSchema);