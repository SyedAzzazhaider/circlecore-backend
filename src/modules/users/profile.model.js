const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  avatar: { type: String, default: null },
  coverImage: { type: String, default: null },
  bio: { type: String, maxlength: [500, 'Bio cannot exceed 500 characters'], default: '' },
  location: { type: String, default: '' },
  website: { type: String, default: '' },
  skills: { type: [String], default: [] },
  interests: { type: [String], default: [] },

  // Document requirement: reputation signal
  reputation: { type: Number, default: 0 },

  // Document requirement: member tier (standard / premium / mod)
  tier: { type: String, enum: ['standard', 'premium', 'mod'], default: 'standard' },

  // Document requirement: moderator badges
  badges: [{
    type: { type: String, enum: ['moderator', 'top_contributor', 'verified', 'senior_member', 'helpful'], required: true },
    label: { type: String, required: true },
    awardedAt: { type: Date, default: Date.now },
    awardedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  }],

  // Document requirement: community score
  communityScore: { type: Number, default: 0 },

  // Document requirement: helpful votes count
  helpfulVotesReceived: { type: Number, default: 0 },

  // Document requirement: seniority tracking
  joinedAt: { type: Date, default: Date.now },

  socialLinks: {
    twitter: { type: String, default: '' },
    linkedin: { type: String, default: '' },
    github: { type: String, default: '' },
  },

  isPublic: { type: Boolean, default: true },
  completionPercentage: { type: Number, default: 0 },

}, { timestamps: true });

// Auto-calculate profile completion percentage on save
profileSchema.pre('save', function () {
  var score = 0;
  if (this.avatar) score += 20;
  if (this.bio && this.bio.length > 10) score += 20;
  if (this.skills && this.skills.length > 0) score += 20;
  if (this.interests && this.interests.length > 0) score += 20;
  if (this.location) score += 10;
  if (this.website || (this.socialLinks && (this.socialLinks.linkedin || this.socialLinks.twitter))) score += 10;
  this.completionPercentage = score;
});

module.exports = mongoose.model('Profile', profileSchema);