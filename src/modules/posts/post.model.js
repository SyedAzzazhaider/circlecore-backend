const mongoose = require('mongoose');

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

  // Document requirement: channel/category inside community
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

  // Document requirement: media files with metadata (S3-ready structure)
  mediaURLs: [{
    url: { type: String, required: true },
    type: { type: String, enum: ['image', 'video', 'document', 'file'], default: 'image' },
    filename: { type: String, default: '' },
    size: { type: Number, default: 0 },
    mimeType: { type: String, default: '' },
  }],

  // Document requirement: resource links fields
  resource: {
    url: { type: String, default: null },
    source: { type: String, default: null },
    description: { type: String, default: null },
    previewImage: { type: String, default: null },
  },

  // Document requirement: poll with options, voting, results
  poll: {
    question: { type: String, default: null },
    options: [{
      _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
      text: { type: String, required: true },
      votes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      voteCount: { type: Number, default: 0 },
    }],
    allowMultiple: { type: Boolean, default: false },
    endsAt: { type: Date, default: null },
    isEnded: { type: Boolean, default: false },
    totalVotes: { type: Number, default: 0 },
  },

  // Document requirement: hashtags
  tags: { type: [String], default: [] },

  isPinned: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },

  reactions: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: {
      type: String,
      enum: ['like', 'love', 'insightful', 'celebrate'],
      default: 'like',
    },
  }],

  reactionCount: { type: Number, default: 0 },
  commentCount: { type: Number, default: 0 },
  viewCount: { type: Number, default: 0 },
  savedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

}, { timestamps: true });

postSchema.index({ communityId: 1, createdAt: -1 });
postSchema.index({ channelId: 1, createdAt: -1 });
postSchema.index({ authorId: 1 });
postSchema.index({ tags: 1 });
postSchema.index({ isPinned: -1, createdAt: -1 });

module.exports = mongoose.model('Post', postSchema);