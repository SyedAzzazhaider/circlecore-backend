const express = require('express');
const router = express.Router();
const eventController = require('./event.controller');
const { authenticate } = require('../../middleware/authenticate');
const validate = require('../../middleware/validate');
const { createEventValidator } = require('./event.validators');

router.get('/my-rsvps', authenticate, eventController.getMyRSVPs);
router.get('/community/:communityId', authenticate, eventController.getCommunityEvents);
router.get('/:id', authenticate, eventController.getById);
router.post('/', authenticate, createEventValidator, validate, eventController.create);
router.post('/:id/rsvp', authenticate, eventController.rsvp);
router.patch('/:id/cancel', authenticate, eventController.cancel);

// Document requirement: Calendar sync
router.get('/:id/calendar', authenticate, eventController.getCalendarLinks);
router.get('/:id/calendar/ical', eventController.downloadIcal);

module.exports = router;