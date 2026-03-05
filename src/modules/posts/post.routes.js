const express = require('express');
const router = express.Router();
const postController = require('./post.controller');
const { authenticate } = require('../../middleware/authenticate');
const validate = require('../../middleware/validate');
const { createPostValidator, updatePostValidator } = require('./post.validators');
const { postLimiter } = require('../../middleware/rateLimiter');

router.get('/community/:communityId', authenticate, postController.getCommunityFeed);
router.get('/tag/:tag', authenticate, postController.getPostsByTag); // hashtag search
router.get('/:id', authenticate, postController.getById);
router.post('/', authenticate, postLimiter, createPostValidator, validate, postController.create);
router.put('/:id', authenticate, updatePostValidator, validate, postController.update);
router.delete('/:id', authenticate, postController.delete);
router.post('/:id/react', authenticate, postController.toggleReaction);
router.post('/:id/save', authenticate, postController.toggleSave);
router.post('/:id/pin', authenticate, postController.pinPost);
router.post('/:id/vote', authenticate, postController.votePoll); // poll voting

module.exports = router;