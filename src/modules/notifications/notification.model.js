const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: [
      'comment_on_post',
      'reply_on_comment',
      'reaction_on_post',
      'reaction_on_comment',
      'new_member_joined',
      'post_pinned',
      'admin_announcement',
      'event_invite',
      'event_reminder',
      'event_cancelled',
      'moderator_action',
      'mention',
    ],
    required: true,
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  isRead: { type: Boolean, default: false },
  readAt: { type: Date, default: null },
  meta: {
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', default: null },
    commentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment', default: null },
    communityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Community', default: null },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', default: null },
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
}, { timestamps: true });

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);