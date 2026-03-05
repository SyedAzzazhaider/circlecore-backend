const { body } = require('express-validator');

const createPostValidator = [
  body('communityId')
    .notEmpty().withMessage('Community ID is required')
    .isMongoId().withMessage('Invalid community ID'),
  body('content')
    .trim()
    .notEmpty().withMessage('Content is required')
    .isLength({ max: 10000 }).withMessage('Content cannot exceed 10000 characters'),
  body('title')
    .optional()
    .isLength({ max: 300 }).withMessage('Title cannot exceed 300 characters'),
  body('type')
    .optional()
    .isIn(['text', 'poll', 'resource', 'announcement'])
    .withMessage('Invalid post type'),
  body('tags')
    .optional()
    .isArray().withMessage('Tags must be an array'),
  body('mediaURLs')
    .optional()
    .isArray().withMessage('Media URLs must be an array'),
];

const updatePostValidator = [
  body('content')
    .optional()
    .isLength({ max: 10000 }).withMessage('Content cannot exceed 10000 characters'),
  body('title')
    .optional()
    .isLength({ max: 300 }).withMessage('Title cannot exceed 300 characters'),
];

module.exports = { createPostValidator, updatePostValidator };