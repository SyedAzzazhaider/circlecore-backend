const express = require('express');
const router = express.Router();
const searchController = require('./search.controller');
const { authenticate } = require('../../middleware/authenticate');

router.get('/', authenticate, searchController.globalSearch);
router.get('/communities', authenticate, searchController.searchCommunities);
router.get('/posts', authenticate, searchController.searchPosts);

module.exports = router;