const express = require('express');
const router  = express.Router();
const searchController = require('./search.controller');
const { authenticate }  = require('../../middleware/authenticate');
const { searchLimiter } = require('../../middleware/rateLimiter');

/**
 * Search Routes
 *
 * CC-25 FIX: searchLimiter applied to all search endpoints.
 *
 * Previously: zero rate limiting on search. All three endpoints use
 * $regex MongoDB queries which are O(N) (no full-text index falls back
 * to regex scan). An attacker or misbehaving client could fire hundreds
 * of concurrent search requests and bring the DB to its knees.
 *
 * searchLimiter: 30 requests / 1 minute per IP — generous enough for
 * real users, tight enough to block abuse. Redis-backed (CC-12).
 */

// All search endpoints — authenticated + rate limited
router.get('/',            authenticate, searchLimiter, searchController.globalSearch);
router.get('/communities', authenticate, searchLimiter, searchController.searchCommunities);
router.get('/posts',       authenticate, searchLimiter, searchController.searchPosts);

module.exports = router;
