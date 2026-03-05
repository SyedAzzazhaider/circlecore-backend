const express = require('express');
const router = express.Router();
const commentController = require('./comment.controller');
const { authenticate } = require('../../middleware/authenticate');
const { body } = require('express-validator');
const validate = require('../../middleware/validate');

const createCommentValidator = [
  body('postId').notEmpty().withMessage('Post ID is required').isMongoId().withMessage('Invalid post ID'),
  body('content').trim().notEmpty().withMessage('Content is required').isLength({ max: 2000 }).withMessage('Comment cannot exceed 2000 characters'),
  body('parentId').optional().isMongoId().withMessage('Invalid parent comment ID'),
];

const updateCommentValidator = [
  body('content').trim().notEmpty().withMessage('Content is required').isLength({ max: 2000 }).withMessage('Comment cannot exceed 2000 characters'),
];

router.get('/post/:postId', authenticate, commentController.getPostComments);
router.get('/:commentId/replies', authenticate, commentController.getReplies);
router.post('/', authenticate, createCommentValidator, validate, commentController.create);
router.put('/:id', authenticate, updateCommentValidator, validate, commentController.update);
router.delete('/:id', authenticate, commentController.delete);
router.post('/:id/react', authenticate, commentController.toggleReaction);
router.post('/:id/helpful', authenticate, commentController.toggleHelpfulVote);

module.exports = router;