const mongoose = require('mongoose');

/**
 * Blocklist Model
 * Document requirement: MODULE H — Blocklists
 *
 * Two types of blocks:
 *
 * 1. COMMUNITY BAN (type: 'community_ban')
 *    Issued by moderator/admin — prevents user from accessing a specific community.
 *    Can be permanent or temporary (expiresAt).
 *
 * 2. USER BLOCK (type: 'user_block')
 *    Issued by any user — prevents the blocked user from interacting with the blocker.
 *    User-to-user blocks are always permanent unless explicitly removed.
 *
 * Note: Platform-wide bans use User.isSuspended + User.role demotion,
 * not this model. This model handles community-level and user-level blocks only.
 */
const blocklistSchema = new mongoose.Schema({

  // ── Block type ───────────────────────────────────────────────────────────
  type: {
    type: String,
    enum: ['community_ban', 'user_block'],
    required: true,
  },

  // ── Who is blocked ───────────────────────────────────────────────────────
  blockedUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  // ── Who issued the block ─────────────────────────────────────────────────
  // For community_ban: moderator or admin
  // For user_block: the user who initiated the block
  blockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  // ── Community scope (required for community_ban, null for user_block) ────
  communityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    default: null,
  },

  // ── Block reason ─────────────────────────────────────────────────────────
  reason: {
    type: String,
    maxlength: 1000,
    default: '',
  },

  // ── Expiry (null = permanent) ─────────────────────────────────────────────
  expiresAt: {
    type: Date,
    default: null,
  },

  // ── Active flag ───────────────────────────────────────────────────────────
  isActive: {
    type: Boolean,
    default: true,
  },

  // ── Audit reference ───────────────────────────────────────────────────────
  flagId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Flag',
    default: null,
  },

}, { timestamps: true });

// ── Indexes ──────────────────────────────────────────────────────────────────
// Prevent duplicate active ban for same user in same community
blocklistSchema.index(
  { type: 1, blockedUserId: 1, communityId: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { type: 'community_ban', isActive: true } }
);
// Prevent duplicate user-to-user block
blocklistSchema.index(
  { type: 1, blockedBy: 1, blockedUserId: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { type: 'user_block', isActive: true } }
);
blocklistSchema.index({ blockedUserId: 1, isActive: 1 });
blocklistSchema.index({ communityId: 1, isActive: 1 });
blocklistSchema.index({ expiresAt: 1 }, { sparse: true });

module.exports = mongoose.model('Blocklist', blocklistSchema);