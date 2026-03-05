const express = require('express');
const router = express.Router();
const communityController = require('./community.controller');
const { authenticate } = require('../../middleware/authenticate');
const validate = require('../../middleware/validate');
const { createCommunityValidator } = require('./community.validators');

router.get('/', communityController.getAll);
router.get('/my', authenticate, communityController.getMyCommunities);
router.get('/:slug', communityController.getBySlug);
router.get('/id/:id', authenticate, communityController.getById);
router.post('/', authenticate, createCommunityValidator, validate, communityController.create);
router.put('/:id', authenticate, communityController.update);
router.post('/:id/join', authenticate, communityController.join);
router.post('/:id/leave', authenticate, communityController.leave);

module.exports = router;