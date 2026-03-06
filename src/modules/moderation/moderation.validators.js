const { body, param, query } = require('express-validator');

/**
 * Moderation Validators
 * Document requirement: MODULE H — Moderation & Safety
 */

const submitFlagValidator = [
  body('contentType')
    .isIn(['post', 'comment', 'user', 'community'])
    .withMessage('Invalid content type'),
  body('contentId')
    .notEmpty().withMessage('Content ID is required')
    .isMongoId().withMessage('Invalid content ID'),
  body('reason')
    .isIn(['spam', 'harassment', 'hate_speech', 'misinformation', 'explicit_content', 'violence', 'off_topic', 'impersonation', 'other'])
    .withMessage('Invalid flag reason'),
  body('description')
    .optional()
    .isLength({ max: 1000 }).withMessage('Description cannot exceed 1000 characters'),
  body('communityId')
    .optional()
    .isMongoId().withMessage('Invalid community ID'),
];

const reviewFlagValidator = [
  param('flagId')
    .isMongoId().withMessage('Invalid flag ID'),
  body('status')
    .isIn(['resolved', 'dismissed'])
    .withMessage('Status must be resolved or dismissed'),
  body('resolution')
    .optional()
    .isIn(['no_action', 'content_removed', 'user_warned', 'user_suspended', 'user_banned'])
    .withMessage('Invalid resolution'),
  body('resolutionNote')
    .optional()
    .isLength({ max: 1000 }).withMessage('Resolution note cannot exceed 1000 characters'),
];

const removeContentValidator = [
  param('contentType')
    .isIn(['post', 'comment']).withMessage('Invalid content type'),
  param('contentId')
    .isMongoId().withMessage('Invalid content ID'),
  body('reason')
    .notEmpty().withMessage('Reason is required')
    .isLength({ max: 1000 }).withMessage('Reason cannot exceed 1000 characters'),
];

const issueWarningValidator = [
  body('userId')
    .notEmpty().withMessage('User ID is required')
    .isMongoId().withMessage('Invalid user ID'),
  body('reason')
    .notEmpty().withMessage('Reason is required')
    .isLength({ max: 1000 }).withMessage('Reason cannot exceed 1000 characters'),
  body('severity')
    .optional()
    .isIn(['minor', 'major', 'final']).withMessage('Invalid severity'),
  body('communityId')
    .optional()
    .isMongoId().withMessage('Invalid community ID'),
];

const suspendUserValidator = [
  body('userId')
    .notEmpty().withMessage('User ID is required')
    .isMongoId().withMessage('Invalid user ID'),
  body('reason')
    .notEmpty().withMessage('Reason is required')
    .isLength({ max: 1000 }).withMessage('Reason cannot exceed 1000 characters'),
  body('suspendedUntil')
    .optional()
    .isISO8601().withMessage('Invalid date format')
    .custom((value) => {
      if (new Date(value) <= new Date()) {
        throw new Error('Suspension end date must be in the future');
      }
      return true;
    }),
];

const unsuspendUserValidator = [
  body('userId')
    .notEmpty().withMessage('User ID is required')
    .isMongoId().withMessage('Invalid user ID'),
];

const banFromCommunityValidator = [
  body('userId')
    .notEmpty().withMessage('User ID is required')
    .isMongoId().withMessage('Invalid user ID'),
  body('communityId')
    .notEmpty().withMessage('Community ID is required')
    .isMongoId().withMessage('Invalid community ID'),
  body('reason')
    .optional()
    .isLength({ max: 1000 }).withMessage('Reason cannot exceed 1000 characters'),
  body('expiresAt')
    .optional()
    .isISO8601().withMessage('Invalid date format'),
];

const unbanFromCommunityValidator = [
  body('userId')
    .notEmpty().withMessage('User ID is required')
    .isMongoId().withMessage('Invalid user ID'),
  body('communityId')
    .notEmpty().withMessage('Community ID is required')
    .isMongoId().withMessage('Invalid community ID'),
];

const blockUserValidator = [
  body('userId')
    .notEmpty().withMessage('User ID is required')
    .isMongoId().withMessage('Invalid user ID'),
];

module.exports = {
  submitFlagValidator,
  reviewFlagValidator,
  removeContentValidator,
  issueWarningValidator,
  suspendUserValidator,
  unsuspendUserValidator,
  banFromCommunityValidator,
  unbanFromCommunityValidator,
  blockUserValidator,
};