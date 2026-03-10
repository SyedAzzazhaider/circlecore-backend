const mongoose = require('mongoose');

/**
 * Post Model
 *
 * CC-18 FIX: Full-text search index added.
 *
 * BEFORE: search.service.js used $regex on title + content + tags.
 *   $regex with no index = full collection scan on every search request.
 *   At 10,000 posts with 1,000 concurrent searches → database overwhelmed.
 *   MongoDB's explain() shows COLLSCAN (collection scan) with 0 index usage.
 *
 * AFTER: $text index on title + content + tags with relevance weights.
 *   search.service.js now uses $text: { $search: query } which uses this index.
 *   MongoDB's explain() shows IXSCAN (index scan) — O(log N) lookup.
 *
 * Weights: title (10) > tags (5) > content (1)
 *   A post titled "React hooks tutorial" ranks above a post that merely
 *   mentions "React hooks" once in the body text. This is the correct
 *   relevance ordering for a community search experience.
 *
 * IMPORTANT — MongoDB only allows ONE text index per collection.
 *   Do not add another text index to this schema.
 */
const postSchema = new mongoose.Schema({
  communityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    required: [true, 'Community is required'],
  },
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Author is required'],
  },
  channelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel',
    default: null,
  },
  title: {
    type: String,
    trim: true,
    maxlength: [300, 'Title cannot exceed 300 characters'],
    default: '',
  },
  content: {
    type: String,
    required: [true, 'Content is required'],
    maxlength: [10000, 'Content cannot exceed 10000 characters'],
  },
  type: {
    type: String,
    enum: ['text', 'poll', 'resource', 'announcement', 'file'],
    default: 'text',
  },
  mediaURLs: [{
    url:      { type: String, required: true },
    type:     { type: String, enum: ['image', 'video', 'document', 'file'], default: 'image' },
    filename: { type: String, default: '' },
    size:     { type: Number, default: 0 },
    mimeType: { type: String, default: '' },
  }],
  resource: {
    url:          { type: String, default: null },
    source:       { type: String, default: null },
    description:  { type: String, default: null },
    previewImage: { type: String, default: null },
  },
  poll: {
    question: { type: String, default: null },
    options: [{
      _id:       { type: mongoose.Schema.Types.ObjectId, auto: true },
      text:      { type: String, required: true },
      votes:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      voteCount: { type: Number, default: 0 },
    }],
    allowMultiple: { type: Boolean, default: false },
    endsAt:        { type: Date,    default: null },
    isEnded:       { type: Boolean, default: false },
    totalVotes:    { type: Number,  default: 0 },
  },
  tags:          { type: [String],  default: [] },
  isPinned:      { type: Boolean,   default: false },
  isActive:      { type: Boolean,   default: true },
  reactions: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: {
      type: String,
      enum: ['like', 'love', 'insightful', 'celebrate'],
      default: 'like',
    },
  }],
  reactionCount: { type: Number, default: 0 },
  commentCount:  { type: Number, default: 0 },
  viewCount:     { type: Number, default: 0 },
  savedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

}, { timestamps: true });

// ─── Existing indexes (preserved) ─────────────────────────────────────────────
postSchema.index({ communityId: 1, createdAt: -1 });
postSchema.index({ channelId: 1,   createdAt: -1 });
postSchema.index({ authorId: 1 });
postSchema.index({ tags: 1 });
postSchema.index({ isPinned: -1,   createdAt: -1 });

// ─── CC-18 FIX: Full-text search index ────────────────────────────────────────
// Replaces $regex full-collection scans in search.service.js.
// title weight 10 = exact title match ranks highest
// tags weight 5   = tagged posts rank above body-text matches
// content weight 1 = body text matches rank lowest
postSchema.index(
  { title: 'text', content: 'text', tags: 'text' },
  { weights: { title: 10, tags: 5, content: 1 }, background: true }
);

module.exports = mongoose.model('Post', postSchema);
