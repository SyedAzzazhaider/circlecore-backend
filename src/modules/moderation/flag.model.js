const mongoose = require('mongoose');

/**
 * Flag Model
 * Document requirement: MODULE H — Content flags + Moderator review queue
 *
 * A flag is submitted by any member when they believe content violates community rules.
 * Flags enter the moderator review queue with status 'pending'.
 * Moderators review and resolve flags — their actions are logged in AuditLog.
 *
 * Supported content types: post, comment, user profile, community
 * Each (reporter, content) pair is unique — one flag per user per piece of content.
 */
const flagSchema = new mongoose.Schema({

  // ── What was flagged ────────────────────────────────────────────────────────
  contentType: {
    type: String,
    enum: ['post', 'comment', 'user', 'community'],
    required: true,
  },

  contentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'contentTypeRef', // dynamic ref resolved by service layer
  },

  // ── Who flagged it ──────────────────────────────────────────────────────────
  flaggedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  // ── Which community the content belongs to (for queue scoping) ─────────────
  communityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    default: null,
  },

  // ── Flag reason — document requirement: content flags ──────────────────────
  reason: {
    type: String,
    enum: [
      'spam',
      'harassment',
      'hate_speech',
      'misinformation',
      'explicit_content',
      'violence',
      'off_topic',
      'impersonation',
      'other',
    ],
    required: true,
  },

  // Additional detail provided by reporter
  description: {
    type: String,
    maxlength: 1000,
    default: '',
  },

  // ── Review queue status — document requirement: moderator review queue ──────
  status: {
    type: String,
    enum: ['pending', 'under_review', 'resolved', 'dismissed'],
    default: 'pending',
  },

  // ── Moderator review ────────────────────────────────────────────────────────
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },

  reviewedAt: {
    type: Date,
    default: null,
  },

  // What action was taken when flag was resolved
  resolution: {
    type: String,
    enum: ['no_action', 'content_removed', 'user_warned', 'user_suspended', 'user_banned'],
    default: null,
  },

  resolutionNote: {
    type: String,
    maxlength: 1000,
    default: '',
  },

}, { timestamps: true });

// ── Indexes ──────────────────────────────────────────────────────────────────
// Prevent duplicate flags from same user on same content
flagSchema.index({ flaggedBy: 1, contentType: 1, contentId: 1 }, { unique: true });
flagSchema.index({ status: 1, createdAt: -1 });           // Review queue ordering
flagSchema.index({ communityId: 1, status: 1 });           // Per-community queue
flagSchema.index({ contentType: 1, contentId: 1 });        // All flags on a piece of content
flagSchema.index({ reviewedBy: 1, reviewedAt: -1 });       // Moderator activity

module.exports = mongoose.model('Flag', flagSchema);