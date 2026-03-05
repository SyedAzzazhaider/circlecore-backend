const mongoose = require('mongoose');

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
  avatar: { type: String, default: null },
  coverImage: { type: String, default: null },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  members: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['member', 'moderator', 'admin'], default: 'member' },
    joinedAt: { type: Date, default: Date.now },
  }],
  memberCount: { type: Number, default: 0 },
  isPrivate: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
  tags: { type: [String], default: [] },
  rules: { type: [String], default: [] },
  category: {
    type: String,
    enum: ['technology', 'business', 'art', 'science', 'sports', 'gaming', 'education', 'health', 'other'],
    default: 'other',
  },
  inviteCodes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InviteCode',
  }],
}, { timestamps: true });

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

communitySchema.methods.isMember = function(userId) {
  return this.members.some(m => m.userId.toString() === userId.toString());
};

communitySchema.methods.getMemberRole = function(userId) {
  const member = this.members.find(m => m.userId.toString() === userId.toString());
  return member ? member.role : null;
};

communitySchema.index({ createdBy: 1 });
communitySchema.index({ tags: 1 });
communitySchema.index({ category: 1 });

module.exports = mongoose.model('Community', communitySchema);