const { body } = require('express-validator');

const createEventValidator = [
  body('communityId')
    .notEmpty().withMessage('Community ID is required')
    .isMongoId().withMessage('Invalid community ID'),
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ max: 200 }).withMessage('Title cannot exceed 200 characters'),
  body('description')
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