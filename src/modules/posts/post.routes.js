const express = require('express');
const router = express.Router();
const postController = require('./post.controller');
const { authenticate } = require('../../middleware/authenticate');
const validate = require('../../middleware/validate');
const { createPostValidator, updatePostValidator } = require('./post.validators');
const { postLimiter } = require('../../middleware/rateLimiter');
const { body } = require('express-validator');

/**
 * Post Routes — MODULE C
 *
 * CC-07 FIX: GET /feed added — unified home feed across all joined communities.
 *   Previously only GET /community/:communityId existed. Without /feed, the
 *   frontend had no way to show a unified activity stream.
 *
 * CC-21 FIX: POST /:id/reply added — semantic reply endpoint per document spec.
 *   Document requires POST /api/posts/:id/reply as a distinct endpoint.
 *   Delegates internally to commentService.createComment() — no logic duplication.
 */

// ─── Feed ─────────────────────────────────────────────────────────────────────

// CC-07 FIX: Unified feed — posts from all communities user has joined
// Must be declared BEFORE /:id to avoid route collision
router.get('/feed', authenticate, postController.getFeed);

// ─── Community & Tag feeds ────────────────────────────────────────────────────
router.get('/community/:communityId', authenticate, postController.getCommunityFeed);
router.get('/tag/:tag',               authenticate, postController.getPostsByTag);

// ─── Single post ──────────────────────────────────────────────────────────────
router.get('/:id', authenticate, postController.getById);

// ─── Create ───────────────────────────────────────────────────────────────────
router.post('/', authenticate, postLimiter, createPostValidator, validate, postController.create);

// ─── Mutate ───────────────────────────────────────────────────────────────────
router.put('/:id',    authenticate, updatePostValidator, validate, postController.update);
router.delete('/:id', authenticate, postController.delete);

// ─── Interactions ─────────────────────────────────────────────────────────────
router.post('/:id/react', authenticate, postController.toggleReaction);
router.post('/:id/save',  authenticate, postController.toggleSave);
router.post('/:id/pin',   authenticate, postController.pinPost);
router.post('/:id/vote',  authenticate, postController.votePoll);

// CC-21 FIX: Semantic reply endpoint — document spec: POST /api/posts/:id/reply
// Validates content here so the dedicated endpoint has its own clean validation stack.
// Internally delegates to commentService.createComment() — no logic is duplicated.
router.post(
  '/:id/reply',
  authenticate,
  [
    body('content')
      .trim()
      .notEmpty().withMessage('Reply content is required')
      .isLength({ max: 2000 }).withMessage('Reply cannot exceed 2000 characters'),
    body('parentId')
      .optional()
      .isMongoId().withMessage('Invalid parent comment ID'),
  ],
  validate,
  postController.replyToPost
);

module.exports = router;
