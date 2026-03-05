const { body } = require('express-validator');

/**
 * Event Validators — MODULE E
 *
 * WHY NORMALIZATION MIDDLEWARE:
 * The DB model uses 'details' as the event body field name.
 * Existing tests and some clients send 'description' instead.
 *
 * express-validator v7 does NOT call a body('details').custom() function
 * when 'details' is absent from req.body — the custom function is simply
 * skipped entirely, so a fallback to req.body.description inside it never runs.
 *
 * The correct pattern is a plain Express middleware placed FIRST in the
 * validator array. It runs before any express-validator checks and normalizes
 * req.body so that 'details' is always populated before validation starts.
 * This is zero-risk: if the client already sends 'details', nothing changes.
 */
const createEventValidator = [

  // Step 1 — Normalize: map 'description' → 'details' before validation
  // Runs as a plain middleware, guaranteed to execute regardless of which
  // field name the client sends.
  (req, res, next) => {
    if (!req.body.details && req.body.description) {
      req.body.details = req.body.description;
    }
    next();
  },

  // Step 2 — Validate fields normally
  body('communityId')
    .notEmpty().withMessage('Community ID is required')
    .isMongoId().withMessage('Invalid community ID'),

  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ max: 200 }).withMessage('Title cannot exceed 200 characters'),

  body('details')
    .trim()
    .notEmpty().withMessage('Description is required')
    .isLength({ max: 5000 }).withMessage('Description cannot exceed 5000 characters'),

  body('startDate')
    .notEmpty().withMessage('Start date is required')
    .isISO8601().withMessage('Invalid start date format'),

  body('endDate')
    .notEmpty().withMessage('End date is required')
    .isISO8601().withMessage('Invalid end date format'),

  body('type')
    .optional()
    .isIn(['webinar', 'meetup', 'online', 'workshop', 'other'])
    .withMessage('Invalid event type'),
];

module.exports = { createEventValidator };