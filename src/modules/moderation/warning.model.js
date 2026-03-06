const mongoose = require('mongoose');

/**
 * Warning Model
 * Document requirement: MODULE H — Member warnings
 *
 * Warnings are issued by moderators to members for rule violations.
 * Warnings accumulate on the user record (User.warningCount).
 * Severity escalates: minor → major → final
 * Final warning typically precedes suspension.
 *
 * Warnings can be community-scoped (violation within a specific community)
 * or platform-wide (issued by admin for platform-level violations).
 */
const warningSchema = new mongoose.Schema({

  // ── Who received the warning ─────────────────────────────────────────────
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  // ── Who issued the warning ───────────────────────────────────────────────
  issuedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  // ── Community scope (null = platform-wide warning from admin) ────────────
  communityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    default: null,
  },

  // ── Warning details ──────────────────────────────────────────────────────
  reason: {
    type: String,
    required: true,
    maxlength: 1000,
  },

  severity: {
    type: String,
    enum: ['minor', 'major', 'final'],
    default: 'minor',
  },

  // Reference to the content that triggered the warning (optional)
  relatedContentType: {
    type: String,
    enum: ['post', 'comment', 'user', 'community', null],
    default: null,
  },

  relatedContentId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
  },

  // Reference to the flag that triggered this warning (optional)
  flagId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Flag',
    default: null,
  },

  // ── Warning status ───────────────────────────────────────────────────────
  isActive: {
    type: Boolean,
    default: true,
  },

  // Warnings can be set to expire (e.g., minor warning expires in 90 days)
  expiresAt: {
    type: Date,
    default: null, // null = permanent
  },

  // ── Acknowledgement ──────────────────────────────────────────────────────
  acknowledgedAt: {
    type: Date,
    default: null,
  },

}, { timestamps: true });

// ── Indexes ──────────────────────────────────────────────────────────────────
warningSchema.index({ userId: 1, createdAt: -1 });
warningSchema.index({ userId: 1, isActive: 1 });
warningSchema.index({ communityId: 1, userId: 1 });
warningSchema.index({ issuedBy: 1, createdAt: -1 });

module.exports = mongoose.model('Warning', warningSchema);