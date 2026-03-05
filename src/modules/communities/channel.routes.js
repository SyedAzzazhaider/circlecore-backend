const express = require('express');
const router = express.Router();
const channelController = require('./channel.controller');
const { authenticate } = require('../../middleware/authenticate');

/**
 * Channel Routes — nested categorization inside communities
 * Document requirement: MODULE C — Nested categorizations
 */

router.post('/', authenticate, channelController.create);
router.get('/community/:communityId', authenticate, channelController.getCommunityChannels);
router.get('/:id', authenticate, channelController.getById);
router.put('/:id', authenticate, channelController.update);
router.patch('/:id/archive', authenticate, channelController.archive);

module.exports = router;