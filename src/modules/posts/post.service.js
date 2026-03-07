const Post = require('./post.model');
const Community = require('../communities/community.model');
const Blocklist = require('../moderation/blocklist.model');
const cache = require('../../utils/cache');
const { emitToCommunity } = require('../../config/socket');
const logger = require('../../utils/logger');

class PostService {

  async createPost({ communityId, authorId, title, content, type, mediaURLs, tags, resource, poll, channelId }) {
    const community = await Community.findById(communityId);
    if (!community) throw Object.assign(new Error('Community not found'), { statusCode: 404 });

    if (!community.isMember(authorId)) {
      throw Object.assign(new Error('You must be a member to post in this community'), { statusCode: 403 });
    }

    // FIX: community ban enforcement — document requirement: MODULE H blocklists
    const isBanned = await Blocklist.findOne({
      type: 'community_ban',
      blockedUserId: authorId,
      communityId,
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });
    if (isBanned) {
      throw Object.assign(new Error('You are banned from posting in this community'), { statusCode: 403 });
    }

    // Document requirement: validate poll options if type is poll
    if (type === 'poll') {
      if (!poll || !poll.options || poll.options.length < 2) {
        throw Object.assign(new Error('Poll must have at least 2 options'), { statusCode: 400 });
      }
      if (poll.options.length > 10) {
        throw Object.assign(new Error('Poll cannot have more than 10 options'), { statusCode: 400 });
      }
    }

    // Document requirement: validate resource URL if type is resource
    if (type === 'resource') {
      if (!resource || !resource.url) {
        throw Object.assign(new Error('Resource posts must include a URL'), { statusCode: 400 });
      }
    }

    const postData = {
      communityId,
      authorId,
      title: title || '',
      content,
      type: type || 'text',
      tags: tags || [],
      channelId: channelId || null,
    };

    // Document requirement: media with metadata structure (S3-ready)
    if (mediaURLs && mediaURLs.length > 0) {
      postData.mediaURLs = mediaURLs.map(m => {
        if (typeof m === 'string') {
          return { url: m, type: 'image', filename: '', size: 0, mimeType: '' };
        }
        return m;
      });
    }

    // Document requirement: resource fields
    if (type === 'resource' && resource) {
      postData.resource = {
        url: resource.url,
        source: resource.source || null,
        description: resource.description || null,
        previewImage: resource.previewImage || null,
      };
    }

    // Document requirement: poll with structured options
    if (type === 'poll' && poll) {
      postData.poll = {
        question: poll.question || content,
        options: poll.options.map(opt => ({
          text: typeof opt === 'string' ? opt : opt.text,
          votes: [],
          voteCount: 0,
        })),
        allowMultiple: poll.allowMultiple || false,
        endsAt: poll.endsAt ? new Date(poll.endsAt) : null,
        isEnded: false,
        totalVotes: 0,
      };
    }

    const post = await Post.create(postData);

    // Invalidate feed cache
    await cache.deletePattern('feed:' + communityId + ':*');

    // Emit real-time event to community room
    try {
      emitToCommunity(communityId, 'post:new', {
        postId: post._id,
        communityId,
        authorId,
        title: post.title,
        type: post.type,
        createdAt: post.createdAt,
      });
    } catch (e) {
      logger.warn('Socket emit failed: ' + e.message);
    }

    // Document requirement: mention detection in posts
    try {
      await this.detectAndNotifyMentions(content, authorId, post._id, 'post');
    } catch (e) {
      logger.warn('Mention detection failed: ' + e.message);
    }

    logger.info('Post created: ' + post._id);
    return post;
  }

  async getCommunityFeed(communityId, { page = 1, limit = 10, type }) {
    const cacheKey = cache.keys.communityFeed(communityId, page);

    if (!type) {
      const cached = await cache.get(cacheKey);
      if (cached) {
        logger.info('Cache hit: feed ' + communityId + ' page ' + page);
        return cached;
      }
    }

    const query = { communityId, isActive: true };
    if (type) query.type = type;

    const skip = (page - 1) * limit;
    const total = await Post.countDocuments(query);

    const posts = await Post.find(query)
      .populate('authorId', 'name email profileId')
      .sort({ isPinned: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const result = {
      posts,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    };

    if (!type) {
      await cache.set(cacheKey, result, 120);
    }

    return result;
  }

  async getPostById(postId, userId) {
    const cacheKey = cache.keys.post(postId);
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.info('Cache hit: post ' + postId);
      return cached;
    }

    const post = await Post.findById(postId)
      .populate('authorId', 'name email profileId')
      .populate('communityId', 'name slug');

    if (!post || !post.isActive) throw Object.assign(new Error('Post not found'), { statusCode: 404 });

    await Post.findByIdAndUpdate(postId, { $inc: { viewCount: 1 } });
    await cache.set(cacheKey, post, 180);
    return post;
  }

  async updatePost(postId, userId, updates) {
    const post = await Post.findById(postId);
    if (!post || !post.isActive) throw Object.assign(new Error('Post not found'), { statusCode: 404 });

    if (post.authorId.toString() !== userId.toString()) {
      throw Object.assign(new Error('You can only edit your own posts'), { statusCode: 403 });
    }

    const allowed = ['title', 'content', 'tags', 'mediaURLs', 'resource'];
    allowed.forEach(field => {
      if (updates[field] !== undefined) post[field] = updates[field];
    });

    await post.save();

    await cache.delete(cache.keys.post(postId));
    await cache.deletePattern('feed:' + post.communityId + ':*');

    return post;
  }

  async deletePost(postId, userId, userRole) {
    const post = await Post.findById(postId);
    if (!post || !post.isActive) throw Object.assign(new Error('Post not found'), { statusCode: 404 });

    const isAuthor = post.authorId.toString() === userId.toString();
    const isAdmin = ['admin', 'super_admin', 'moderator'].includes(userRole);

    if (!isAuthor && !isAdmin) {
      throw Object.assign(new Error('You do not have permission to delete this post'), { statusCode: 403 });
    }

    post.isActive = false;
    await post.save();

    await cache.delete(cache.keys.post(postId));
    await cache.deletePattern('feed:' + post.communityId + ':*');

    try {
      emitToCommunity(post.communityId, 'post:deleted', { postId });
    } catch (e) {
      logger.warn('Socket emit failed: ' + e.message);
    }

    logger.info('Post deleted: ' + postId);
    return { message: 'Post deleted successfully' };
  }

  async toggleReaction(postId, userId, reactionType) {
    const post = await Post.findById(postId);
    if (!post || !post.isActive) throw Object.assign(new Error('Post not found'), { statusCode: 404 });

    const existingIndex = post.reactions.findIndex(
      r => r.userId.toString() === userId.toString()
    );

    const isAdding = existingIndex === -1;

    if (!isAdding) {
      post.reactions.splice(existingIndex, 1);
    } else {
      post.reactions.push({ userId, type: reactionType || 'like' });
    }

    post.reactionCount = post.reactions.length;
    await post.save();

    await cache.delete(cache.keys.post(postId));

    // Document requirement: update author reputation on post reaction
    try {
      const reputationService = require('../users/reputation.service');
      await reputationService.updatePostReactionReputation(post.authorId, isAdding);
      await reputationService.checkAndAssignAutoBadge(post.authorId);
    } catch (e) {
      logger.warn('Reputation update failed: ' + e.message);
    }

    try {
      emitToCommunity(post.communityId, 'post:reaction', {
        postId,
        reactionCount: post.reactionCount,
      });
    } catch (e) {
      logger.warn('Socket emit failed: ' + e.message);
    }

    return post;
  }

  async toggleSavePost(postId, userId) {
    const post = await Post.findById(postId);
    if (!post || !post.isActive) throw Object.assign(new Error('Post not found'), { statusCode: 404 });

    const savedIndex = post.savedBy.findIndex(id => id.toString() === userId.toString());
    if (savedIndex > -1) {
      post.savedBy.splice(savedIndex, 1);
    } else {
      post.savedBy.push(userId);
    }

    await post.save();
    return { saved: savedIndex === -1 };
  }

  async pinPost(postId, userId, communityId) {
    const community = await Community.findById(communityId);
    const memberRole = community.getMemberRole(userId);
    if (!['admin', 'moderator'].includes(memberRole)) {
      throw Object.assign(new Error('Only admins and moderators can pin posts'), { statusCode: 403 });
    }

    // FIX: replaced deprecated { new: true } with { returnDocument: 'after' }
    const post = await Post.findByIdAndUpdate(
      postId,
      [{ $set: { isPinned: { $not: '$isPinned' } } }],
      { returnDocument: 'after' }
    );

    await cache.deletePattern('feed:' + communityId + ':*');
    return post;
  }

  /**
   * Document requirement: Poll voting
   */
  async votePoll(postId, userId, optionId) {
    const post = await Post.findById(postId);
    if (!post || !post.isActive) throw Object.assign(new Error('Post not found'), { statusCode: 404 });
    if (post.type !== 'poll') throw Object.assign(new Error('This post is not a poll'), { statusCode: 400 });
    if (post.poll.isEnded) throw Object.assign(new Error('This poll has ended'), { statusCode: 400 });

    if (post.poll.endsAt && new Date() > post.poll.endsAt) {
      post.poll.isEnded = true;
      await post.save();
      throw Object.assign(new Error('This poll has ended'), { statusCode: 400 });
    }

    const option = post.poll.options.id(optionId);
    if (!option) throw Object.assign(new Error('Poll option not found'), { statusCode: 404 });

    const hasVotedThis = option.votes.some(v => v.toString() === userId.toString());

    if (!post.poll.allowMultiple) {
      post.poll.options.forEach(opt => {
        opt.votes = opt.votes.filter(v => v.toString() !== userId.toString());
        opt.voteCount = opt.votes.length;
      });
    }

    if (hasVotedThis) {
      option.votes = option.votes.filter(v => v.toString() !== userId.toString());
    } else {
      option.votes.push(userId);
    }

    option.voteCount = option.votes.length;
    post.poll.totalVotes = post.poll.options.reduce((sum, opt) => sum + opt.voteCount, 0);

    await post.save();
    await cache.delete(cache.keys.post(postId));

    return {
      pollResults: post.poll.options.map(opt => ({
        optionId: opt._id,
        text: opt.text,
        voteCount: opt.voteCount,
        percentage: post.poll.totalVotes > 0
          ? Math.round((opt.voteCount / post.poll.totalVotes) * 100)
          : 0,
      })),
      totalVotes: post.poll.totalVotes,
      userVoted: optionId,
    };
  }

  /**
   * Document requirement: Hashtag search
   */
  async getPostsByTag(tag, { page = 1, limit = 10 }) {
    const skip = (page - 1) * limit;
    const cleanTag = tag.replace(/^#/, '').toLowerCase();

    const total = await Post.countDocuments({ tags: cleanTag, isActive: true });

    const posts = await Post.find({ tags: cleanTag, isActive: true })
      .populate('authorId', 'name email profileId')
      .populate('communityId', 'name slug')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    return {
      tag: cleanTag,
      posts,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Document requirement: Mention notifications
   */
  async detectAndNotifyMentions(content, authorId, sourceId, sourceType) {
    if (!content) return;

    const mentionRegex = /@([a-zA-Z0-9_]+)/g;
    const matches = content.match(mentionRegex);
    if (!matches || matches.length === 0) return;

    const User = require('../auth/auth.model');
    const NotificationService = require('../notifications/notification.service');

    const usernames = [...new Set(matches.map(m => m.slice(1)))];

    for (const username of usernames) {
      try {
        const mentionedUser = await User.findOne({
          name: { $regex: new RegExp('^' + username + '$', 'i') },
        });

        if (!mentionedUser) continue;
        if (mentionedUser._id.toString() === authorId.toString()) continue;

        await NotificationService.createNotification({
          userId: mentionedUser._id,
          type: 'mention',
          title: 'You were mentioned',
          message: 'Someone mentioned you in a ' + sourceType,
          meta: {
            fromUserId: authorId,
            postId: sourceType === 'post' ? sourceId : null,
            commentId: sourceType === 'comment' ? sourceId : null,
          },
        });
      } catch (e) {
        logger.warn('Mention notify failed for username: ' + username);
      }
    }
  }
}

module.exports = new PostService();