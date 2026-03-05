const commentService = require('./comment.service');
const ApiResponse = require('../../utils/apiResponse');

class CommentController {

  async create(req, res, next) {
    try {
      const { postId, content, parentId } = req.body;
      const comment = await commentService.createComment({
        postId,
        content,
        parentId,
        authorId: req.user._id,
      });
      return ApiResponse.created(res, { comment }, 'Comment created successfully');
    } catch (error) { next(error); }
  }

  async getPostComments(req, res, next) {
    try {
      const { page, limit } = req.query;
      const result = await commentService.getPostComments(
        req.params.postId, { page, limit }
      );
      return ApiResponse.success(res, result, 'Comments fetched');
    } catch (error) { next(error); }
  }

  async getReplies(req, res, next) {
    try {
      const { page, limit } = req.query;
      const result = await commentService.getCommentReplies(
        req.params.commentId, { page, limit }
      );
      return ApiResponse.success(res, result, 'Replies fetched');
    } catch (error) { next(error); }
  }

  async update(req, res, next) {
    try {
      const comment = await commentService.updateComment(
        req.params.id, req.user._id, req.body.content
      );
      return ApiResponse.success(res, { comment }, 'Comment updated');
    } catch (error) { next(error); }
  }

  async delete(req, res, next) {
    try {
      const result = await commentService.deleteComment(
        req.params.id, req.user._id, req.user.role
      );
      return ApiResponse.success(res, result, result.message);
    } catch (error) { next(error); }
  }

  async toggleReaction(req, res, next) {
    try {
      const comment = await commentService.toggleReaction(
        req.params.id, req.user._id, req.body.type
      );
      return ApiResponse.success(res, { reactionCount: comment.reactionCount }, 'Reaction toggled');
    } catch (error) { next(error); }
  }

  async toggleHelpfulVote(req, res, next) {
    try {
      const result = await commentService.toggleHelpfulVote(
        req.params.id, req.user._id
      );
      return ApiResponse.success(res, result, 'Helpful vote toggled');
    } catch (error) { next(error); }
  }
}

module.exports = new CommentController();