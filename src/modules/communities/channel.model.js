const mongoose = require('mongoose');

/**
 * Channel Model — nested categorization inside communities
 * Document requirement: MODULE C — Nested categorizations
 * Each community can have multiple channels (e.g. #general, #resources, #announcements)
 */
const channelSchema = new mongoose.Schema({
  communityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    required: [true, 'Community is required'],
  },
  name: {
    type: String,
    required: [true, 'Channel name is required'],
    trim: true,
    minlength: [2, 'Channel name must be at least 2 characters'],
    maxlength: [50, 'Channel name cannot exceed 50 characters'],
  },
  slug: {
    type: String,
    trim: true,
    lowercase: true,
  },
  description: {
    type: String,
    maxlength: [300, 'Description cannot exceed 300 characters'],
    default: '',
  },
  type: {
    type: String,
    enum: ['general', 'announcements', 'resources', 'events', 'off-topic', 'custom'],
    default: 'general',
  },
  isPrivate: { type: Boolean, default: false },
  isArchived: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
}, { timestamps: true });

// Auto-generate slug from name
channelSchema.pre('save', function () {
  if (this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
});

channelSchema.index({ communityId: 1, order: 1 });
channelSchema.index({ communityId: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model('Channel', channelSchema);