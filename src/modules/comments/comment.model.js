const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  postId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: [true, 'Post ID is required'],
  },
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Author is required'],
  },
  content: {
    type: String,
    required: [true, 'Content is required'],
    maxlength: [2000, 'Comment cannot exceed 2000 characters'],
    trim: true,
  },
  parentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null,
  },
  reactions: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: {
      type: String,
      enum: ['like', 'love', 'insightful', 'celebrate'],
      default: 'like',
    },
  }],
  reactionCount: { type: Number, default: 0 },
  replyCount: { type: Number, default: 0 },

  // Document requirement: helpful votes on comments
  helpfulVotes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  helpfulVoteCount: { type: Number, default: 0 },

  isActive: { type: Boolean, default: true },
  isEdited: { type: Boolean, default: false },
}, { timestamps: true });

commentSchema.index({ postId: 1, createdAt: 1 });
commentSchema.index({ authorId: 1 });
commentSchema.index({ parentId: 1 });

module.exports = mongoose.model('Comment', commentSchema);