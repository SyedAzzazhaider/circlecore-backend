const { body } = require('express-validator');

const createCommunityValidator = [
  body('name')
    .trim()
    .notEmpty().withMessage('Community name is required')
    .isLength({ min: 3, max: 100 }).withMessage('Name must be between 3 and 100 characters'),
  body('description')
    .trim()
    .notEmpty().withMessage('Description is required')
    .isLength({ max: 1000 }).withMessage('Description cannot exceed 1000 characters'),
  body('category')
    .optional()
    .isIn(['technology', 'business', 'art', 'science', 'sports', 'gaming', 'education', 'health', 'other'])
    .withMessage('Invalid category'),
  body('tags')
    .optional()
    .isArray().withMessage('Tags must be an array'),
  body('isPrivate')
    .optional()
    .isBoolean().withMessage('isPrivate must be a boolean'),
];

module.exports = { createCommunityValidator };