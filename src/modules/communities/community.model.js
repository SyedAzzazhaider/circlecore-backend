const mongoose = require('mongoose');

/**
 * Community Model
 *
 * CC-20 FIX: { 'members.userId': 1 } compound index added.
 *
 * This is the single most impactful missing index in the entire codebase.
 *
 * Without it: Community.find({ 'members.userId': userId }) — which runs on
 * EVERY home feed request (CC-07 getUserFeed) — does a full collection scan
 * on the communities collection. At 10,000 communities, each feed request
 * scans every community document and every nested member sub-document.
 *
 * With it: The query uses a multi-key index on the members array and resolves
 * in O(log N) instead of O(N*M) where M is average members per community.
 *
 * Additional indexes added:
 *   { 'members.userId': 1, isActive: 1 } → Feed query with active filter
 *   { slug: 1 }                          → Community lookup by slug (every page load)
 *   { isActive: 1, memberCount: -1 }     → Discover page sorted by size
 *   { name: 'text', description: 'text' } → Full-text search (getAllCommunities search param)
 */
const communitySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Community name is required'],
    trim: true,
    minlength: [3, 'Name must be at least 3 characters'],
    maxlength: [100, 'Name cannot exceed 100 characters'],
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true,
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: [1000, 'Description cannot exceed 1000 characters'],
  },
  avatar:     { type: String, default: null },
  coverImage: { type: String, default: null },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  members: [{
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role:     { type: String, enum: ['member', 'moderator', 'admin'], default: 'member' },
    joinedAt: { type: Date, default: Date.now },
  }],
  memberCount: { type: Number, default: 0 },
  isPrivate:   { type: Boolean, default: true },
  isActive:    { type: Boolean, default: true },
  tags:        { type: [String], default: [] },
  rules:       { type: [String], default: [] },
  category: {
    type: String,
    enum: ['technology', 'business', 'art', 'science', 'sports', 'gaming', 'education', 'health', 'other'],
    default: 'other',
  },
  inviteCodes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'InviteCode' }],
}, { timestamps: true });

// ─── Slug generation ──────────────────────────────────────────────────────────
communitySchema.pre('save', function() {
  if (this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
});

// ─── Methods ──────────────────────────────────────────────────────────────────
communitySchema.methods.isMember = function(userId) {
  return this.members.some(m => m.userId.toString() === userId.toString());
};

communitySchema.methods.getMemberRole = function(userId) {
  const member = this.members.find(m => m.userId.toString() === userId.toString());
  return member ? member.role : null;
};

// ─── CC-20 FIX: Indexes ───────────────────────────────────────────────────────

// CRITICAL: getUserFeed() — queries this on every home feed request
// Multi-key index on embedded members array — O(log N) instead of O(N*M)
communitySchema.index({ 'members.userId': 1, isActive: 1 }, { background: true });

// Slug lookup — runs on every community page load
communitySchema.index({ slug: 1 }, { unique: true, background: true });

// Discover page — isActive filter + sorted by size
communitySchema.index({ isActive: 1, memberCount: -1 }, { background: true });

// Existing indexes preserved
communitySchema.index({ createdBy: 1 }, { background: true });
communitySchema.index({ tags: 1 },      { background: true });
communitySchema.index({ category: 1 },  { background: true });

// Full-text search — supports $text: { $search: query } in getAllCommunities()
communitySchema.index(
  { name: 'text', description: 'text', tags: 'text' },
  { weights: { name: 10, tags: 5, description: 1 }, background: true }
);

// ─────────────────────────────────────────────────────────────────────────────

module.exports = mongoose.model('Community', communitySchema);
