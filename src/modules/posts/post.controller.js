const postService = require('./post.service');
const ApiResponse  = require('../../utils/apiResponse');

/**
 * Post Controller — MODULE C
 *
 * CC-07 FIX: getFeed() — controller handler for GET /api/posts/feed
 * CC-21 FIX: replyToPost() — controller handler for POST /api/posts/:id/reply
 */

class PostController {

  async create(req, res, next) {
    try {
      const { communityId, title, content, type, mediaURLs, tags, resource, poll, channelId } = req.body;
      const post = await postService.createPost({
        communityId, title, content, type, mediaURLs, tags, resource, poll, channelId,
        authorId: req.user._id,
      });
      return ApiResponse.created(res, { post }, 'Post created successfully');
    } catch (error) { next(error); }
  }

  // CC-07 FIX: Unified home feed handler
  async getFeed(req, res, next) {
    try {
      const { page, limit } = req.query;
      const result = await postService.getUserFeed(req.user._id, { page, limit });
      return ApiResponse.success(res, result, 'Feed fetched successfully');
    } catch (error) { next(error); }
  }

  async getCommunityFeed(req, res, next) {
    try {
      const { page, limit, type } = req.query;
      const result = await postService.getCommunityFeed(
        req.params.communityId, { page, limit, type }
      );
      return ApiResponse.success(res, result, 'Community feed fetched');
    } catch (error) { next(error); }
  }

  async getById(req, res, next) {
    try {
      const post = await postService.getPostById(req.params.id, req.user._id);
      return ApiResponse.success(res, { post }, 'Post fetched');
    } catch (error) { next(error); }
  }

  async update(req, res, next) {
    try {
      const post = await postService.updatePost(req.params.id, req.user._id, req.body);
      return ApiResponse.success(res, { post }, 'Post updated successfully');
    } catch (error) { next(error); }
  }

  async delete(req, res, next) {
    try {
      const result = await postService.deletePost(req.params.id, req.user._id, req.user.role);
      return ApiResponse.success(res, result, result.message);
    } catch (error) { next(error); }
  }

  async toggleReaction(req, res, next) {
    try {
      const post = await postService.toggleReaction(req.params.id, req.user._id, req.body.type);
      return ApiResponse.success(res, { reactionCount: post.reactionCount }, 'Reaction toggled');
    } catch (error) { next(error); }
  }

  async toggleSave(req, res, next) {
    try {
      const result = await postService.toggleSavePost(req.params.id, req.user._id);
      return ApiResponse.success(res, result, result.saved ? 'Post saved' : 'Post unsaved');
    } catch (error) { next(error); }
  }

  async pinPost(req, res, next) {
    try {
      const post = await postService.pinPost(req.params.id, req.user._id, req.body.communityId);
      return ApiResponse.success(res, { post }, post.isPinned ? 'Post pinned' : 'Post unpinned');
    } catch (error) { next(error); }
  }

  async votePoll(req, res, next) {
    try {
      const result = await postService.votePoll(req.params.id, req.user._id, req.body.optionId);
      return ApiResponse.success(res, result, 'Vote cast successfully');
    } catch (error) { next(error); }
  }

  async getPostsByTag(req, res, next) {
    try {
      const { page, limit } = req.query;
      const result = await postService.getPostsByTag(req.params.tag, { page, limit });
      return ApiResponse.success(res, result, 'Posts fetched by tag');
    } catch (error) { next(error); }
  }

  // CC-21 FIX: Semantic reply endpoint — POST /api/posts/:id/reply
  // The document specifies this as a distinct endpoint.
  // Delegates entirely to commentService to avoid any logic duplication.
  // postId comes from the URL param, parentId optionally from body (for nested replies).
  async replyToPost(req, res, next) {
    try {
      const commentService = require('../comments/comment.service');
      const comment = await commentService.createComment({
        postId:   req.params.id,
        content:  req.body.content,
        parentId: req.body.parentId || null,
        authorId: req.user._id,
      });
      return ApiResponse.created(res, { comment }, 'Reply posted successfully');
    } catch (error) { next(error); }
  }
}

module.exports = new PostController();
