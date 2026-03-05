const { body } = require('express-validator');

const updateProfileValidator = [
  body('bio')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Bio cannot exceed 500 characters'),
  body('location')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Location cannot exceed 100 characters'),
  body('website')
    .optional()
    .isURL()
    .withMessage('Please provide a valid website URL'),
  body('skills')
    .optional()
    .isArray()
    .withMessage('Skills must be an array'),
  body('skills.*')
    .optional()
    .isString()
    .isLength({ max: 50 })
    .withMessage('Each skill cannot exceed 50 characters'),
  body('interests')
    .optional()
    .isArray()
    .withMessage('Interests must be an array'),
  body('interests.*')
    .optional()
    .isString()
    .isLength({ max: 50 })
    .withMessage('Each interest cannot exceed 50 characters'),
  body('socialLinks.twitter')
    .optional()
    .isURL()
    .withMessage('Please provide a valid Twitter URL'),
  body('socialLinks.linkedin')
    .optional()
    .isURL()
    .withMessage('Please provide a valid LinkedIn URL'),
  body('socialLinks.github')
    .optional()
    .isURL()
    .withMessage('Please provide a valid GitHub URL'),
];

module.exports = { updateProfileValidator };