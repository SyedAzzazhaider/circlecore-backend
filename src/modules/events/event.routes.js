const express = require('express');
const router  = express.Router();
const eventController = require('./event.controller');
const { authenticate } = require('../../middleware/authenticate');
const validate = require('../../middleware/validate');
const { createEventValidator } = require('./event.validators');

/**
 * Event Routes — MODULE D/E
 *
 * CC-08 FIX: GET / added — global platform-wide event discovery.
 *   Previously only GET /community/:communityId existed. Users had no way to
 *   browse upcoming events without knowing specific community IDs.
 *   Must be declared BEFORE /:id to prevent "community" matching as an ID.
 */

// ─── Global discovery — CC-08 FIX ────────────────────────────────────────────
// GET /api/events?type=online&communityId=xxx&page=1&limit=10
router.get('/', authenticate, eventController.getAll);

// ─── User-specific ────────────────────────────────────────────────────────────
router.get('/my-rsvps', authenticate, eventController.getMyRSVPs);

// ─── Community-scoped ─────────────────────────────────────────────────────────
router.get('/community/:communityId', authenticate, eventController.getCommunityEvents);

// ─── Single event ─────────────────────────────────────────────────────────────
router.get('/:id', authenticate, eventController.getById);

// ─── Create ───────────────────────────────────────────────────────────────────
router.post('/', authenticate, createEventValidator, validate, eventController.create);

// ─── RSVP & Cancel ────────────────────────────────────────────────────────────
router.post('/:id/rsvp',   authenticate, eventController.rsvp);
router.patch('/:id/cancel', authenticate, eventController.cancel);

// ─── Calendar sync ────────────────────────────────────────────────────────────
router.get('/:id/calendar',       authenticate, eventController.getCalendarLinks);
router.get('/:id/calendar/ical',  eventController.downloadIcal);

module.exports = router;
