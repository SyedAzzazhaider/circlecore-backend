const mongoose = require('mongoose');
const { PROFILE_TIERS } = require('../../constants/tiers');

/**
 * Profile Model
 *
 * CC-19 FIX: Critical MongoDB indexes added.
 *
 * Previously: ZERO indexes on this model. The profile is fetched on almost
 * every authenticated request (auth middleware populates req.user.profileId).
 * Without indexes, every profile lookup was a full collection scan (O(N)).
 *
 * Added indexes:
 *   { userId: 1 } unique   → Primary lookup — every profile fetch by userId
 *   { reputation: -1 }     → Leaderboard / top contributors queries
 *   { tier: 1 }            → Tier-based feature gates and admin queries
 *   { communityScore: -1 } → Community leaderboard sorting
 *   { isPublic: 1 }        → Public profile discovery
 *
 * Also: tier enum fixed to use canonical PROFILE_TIERS from CC-01 (Step 1).
 * The original 'standard' default is replaced by 'free' per the canonical enum.
 */
const profileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  avatar:     { type: String, default: null },
  // CC-01 (Step 1): avatarKey stored for S3 deletion when avatar is replaced
  avatarKey:  { type: String, default: null },
  coverImage: { type: String, default: null },
  coverImageKey: { type: String, default: null },
  bio: {
    type: String,
    maxlength: [500, 'Bio cannot exceed 500 characters'],
    default: '',
  },
  location:  { type: String, default: '' },
  website:   { type: String, default: '' },
  skills:    { type: [String], default: [] },
  interests: { type: [String], default: [] },

  // Document requirement: reputation signal
  reputation: { type: Number, default: 0, min: 0 },

  // CC-01 (Step 1): Canonical tier from constants/tiers.js
  tier: {
    type: String,
    enum: PROFILE_TIERS,
    default: 'free',
  },

  // Document requirement: moderator badges
  badges: [{
    type:      { type: String, enum: ['moderator', 'top_contributor', 'verified', 'senior_member', 'helpful'], required: true },
    label:     { type: String, required: true },
    awardedAt: { type: Date, default: Date.now },
    awardedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  }],

  // Document requirement: community score
  communityScore: { type: Number, default: 0, min: 0 },

  // Document requirement: helpful votes count
  helpfulVotesReceived: { type: Number, default: 0, min: 0 },

  // Document requirement: seniority tracking
  joinedAt: { type: Date, default: Date.now },

  socialLinks: {
    twitter:  { type: String, default: '' },
    linkedin: { type: String, default: '' },
    github:   { type: String, default: '' },
  },

  isPublic:             { type: Boolean, default: true },
  completionPercentage: { type: Number, default: 0, min: 0, max: 100 },

}, { timestamps: true });

// ─── Auto-calculate profile completion percentage on save ─────────────────────
profileSchema.pre('save', function() {
  let score = 0;
  if (this.avatar) score += 20;
  if (this.bio && this.bio.length > 10) score += 20;
  if (this.skills    && this.skills.length    > 0) score += 20;
  if (this.interests && this.interests.length > 0) score += 20;
  if (this.location) score += 10;
  if (this.website || (this.socialLinks && (this.socialLinks.linkedin || this.socialLinks.twitter))) score += 10;
  this.completionPercentage = score;
});

// ─── CC-19 FIX: Indexes ───────────────────────────────────────────────────────

// Primary lookup — covers profile fetch on every auth'd request
// userId unique:true creates an index, but explicit declaration ensures
// background creation and proper index options
profileSchema.index({ userId: 1 }, { unique: true, background: true });

// Reputation leaderboard — GET /api/profiles/leaderboard?sort=reputation
profileSchema.index({ reputation: -1 }, { background: true });

// Tier-based queries — billing gates, admin queries
profileSchema.index({ tier: 1 }, { background: true });

// Community leaderboard
profileSchema.index({ communityScore: -1 }, { background: true });

// Public profile discovery
profileSchema.index({ isPublic: 1 }, { background: true });

// ─────────────────────────────────────────────────────────────────────────────

module.exports = mongoose.model('Profile', profileSchema);
