const Comment = require('./comment.model');
const Post = require('../posts/post.model');
const Blocklist = require('../moderation/blocklist.model');
const reputationService = require('../users/reputation.service');
const logger = require('../../utils/logger');

class CommentService {

  async createComment({ postId, authorId, content, parentId }) {
    const post = await Post.findById(postId);
    if (!post || !post.isActive) {
      throw Object.assign(new Error('Post not found'), { statusCode: 404 });
    }

    // FIX: community ban enforcement — document requirement: MODULE H blocklists
    const isBanned = await Blocklist.findOne({
      type: 'community_ban',
      blockedUserId: authorId,
      communityId: post.communityId,
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });
    if (isBanned) {
      throw Object.assign(new Error('You are banned from commenting in this community'), { statusCode: 403 });
    }

    const comment = await Comment.create({
      postId,
      authorId,
      content,
      parentId: parentId || null,
    });

    await Post.findByIdAndUpdate(postId, { $inc: { commentCount: 1 } });

    if (parentId) {
      await Comment.findByIdAndUpdate(parentId, { $inc: { replyCount: 1 } });
    }

    // Document requirement: live comments real-time — emit socket event on comment creation
    try {
      const { emitToCommunity } = require('../../config/socket');
      emitToCommunity(post.communityId.toString(), 'comment:new', {
        commentId: comment._id,
        postId,
        authorId,
        content,
        parentId: parentId || null,
        createdAt: comment.createdAt,
      });
    } catch (e) {
      logger.warn('Socket emit failed for comment: ' + e.message);
    }

    // Notify post author if commenter is different user
    try {
      if (post.authorId.toString() !== authorId.toString()) {
        const NotificationService = require('../notifications/notification.service');
        await NotificationService.createNotification({
          userId: post.authorId,
          type: 'comment_on_post',
          title: 'New comment on your post',
          message: 'Someone commented on your post',
          meta: { fromUserId: authorId, postId, commentId: comment._id },
        });
      }
    } catch (e) {
      logger.warn('Comment notification failed: ' + e.message);
    }

    // Notify parent comment author if this is a reply
    try {
      if (parentId) {
        const parentComment = await Comment.findById(parentId);
        if (parentComment && parentComment.authorId.toString() !== authorId.toString()) {
          const NotificationService = require('../notifications/notification.service');
          await NotificationService.createNotification({
            userId: parentComment.authorId,
            type: 'reply_on_comment',
            title: 'New reply to your comment',
            message: 'Someone replied to your comment',
            meta: { fromUserId: authorId, postId, commentId: comment._id },
          });
        }
      }
    } catch (e) {
      logger.warn('Reply notification failed: ' + e.message);
    }

    // Document requirement: mention detection in comments
    try {
      const postService = require('../posts/post.service');
      await postService.detectAndNotifyMentions(content, authorId, comment._id, 'comment');
    } catch (e) {
      logger.warn('Mention detection failed in comment: ' + e.message);
    }

    logger.info('Comment created: ' + comment._id + ' on post: ' + postId);
    return comment;
  }

  async getPostComments(postId, { page = 1, limit = 20 }) {
    const post = await Post.findById(postId);
    if (!post || !post.isActive) {
      throw Object.assign(new Error('Post not found'), { statusCode: 404 });
    }

    const skip = (page - 1) * limit;
    const total = await Comment.countDocuments({ postId, parentId: null, isActive: true });

    const comments = await Comment.find({ postId, parentId: null, isActive: true })
      .populate('authorId', 'name email profileId')
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    return {
      comments,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getCommentReplies(commentId, { page = 1, limit = 10 }) {
    const skip = (page - 1) * limit;
    const total = await Comment.countDocuments({ parentId: commentId, isActive: true });

    const replies = await Comment.find({ parentId: commentId, isActive: true })
      .populate('authorId', 'name email profileId')
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    return {
      replies,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    };
  }

  async updateComment(commentId, userId, content) {
    const comment = await Comment.findById(commentId);
    if (!comment || !comment.isActive) {
      throw Object.assign(new Error('Comment not found'), { statusCode: 404 });
    }

    if (comment.authorId.toString() !== userId.toString()) {
      throw Object.assign(new Error('You can only edit your own comments'), { statusCode: 403 });
    }

    comment.content = content;
    comment.isEdited = true;
    await comment.save();
    return comment;
  }

  async deleteComment(commentId, userId, userRole) {
    const comment = await Comment.findById(commentId);
    if (!comment || !comment.isActive) {
      throw Object.assign(new Error('Comment not found'), { statusCode: 404 });
    }

    const isAuthor = comment.authorId.toString() === userId.toString();
    const isAdmin = ['admin', 'super_admin', 'moderator'].includes(userRole);

    if (!isAuthor && !isAdmin) {
      throw Object.assign(new Error('You do not have permission to delete this comment'), { statusCode: 403 });
    }

    comment.isActive = false;
    await comment.save();

    await Post.findByIdAndUpdate(comment.postId, { $inc: { commentCount: -1 } });

    if (comment.parentId) {
      await Comment.findByIdAndUpdate(comment.parentId, { $inc: { replyCount: -1 } });
    }

    return { message: 'Comment deleted successfully' };
  }

  async toggleReaction(commentId, userId, reactionType) {
    const comment = await Comment.findById(commentId);
    if (!comment || !comment.isActive) {
      throw Object.assign(new Error('Comment not found'), { statusCode: 404 });
    }

    const existingIndex = comment.reactions.findIndex(
      r => r.userId.toString() === userId.toString()
    );

    const isAdding = existingIndex === -1;

    if (!isAdding) {
      comment.reactions.splice(existingIndex, 1);
    } else {
      comment.reactions.push({ userId, type: reactionType || 'like' });
    }

    comment.reactionCount = comment.reactions.length;
    await comment.save();

    // Document requirement: update author reputation on reaction
    try {
      await reputationService.updateCommentReactionReputation(comment.authorId, isAdding);
      await reputationService.checkAndAssignAutoBadge(comment.authorId);
    } catch (e) {
      logger.warn('Reputation update failed: ' + e.message);
    }

    return comment;
  }

  // Document requirement: Helpful votes on comments
  async toggleHelpfulVote(commentId, userId) {
    const comment = await Comment.findById(commentId);
    if (!comment || !comment.isActive) {
      throw Object.assign(new Error('Comment not found'), { statusCode: 404 });
    }

    if (comment.authorId.toString() === userId.toString()) {
      throw Object.assign(new Error('You cannot mark your own comment as helpful'), { statusCode: 400 });
    }

    const existingIndex = comment.helpfulVotes
      ? comment.helpfulVotes.findIndex(id => id.toString() === userId.toString())
      : -1;

    const isAdding = existingIndex === -1;

    if (!isAdding) {
      comment.helpfulVotes.splice(existingIndex, 1);
    } else {
      if (!comment.helpfulVotes) comment.helpfulVotes = [];
      comment.helpfulVotes.push(userId);
    }

    comment.helpfulVoteCount = comment.helpfulVotes.length;
    await comment.save();

    try {
      await reputationService.updateHelpfulVoteReputation(comment.authorId, isAdding);
      await reputationService.checkAndAssignAutoBadge(comment.authorId);
    } catch (e) {
      logger.warn('Reputation update failed: ' + e.message);
    }

    logger.info('Helpful vote toggled on comment: ' + commentId + ' by user: ' + userId);
    return {
      helpfulVoteCount: comment.helpfulVoteCount,
      isHelpful: isAdding,
    };
  }
}

module.exports = new CommentService();