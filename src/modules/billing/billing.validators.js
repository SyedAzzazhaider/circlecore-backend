const { body } = require('express-validator');

/**
 * Billing Validators
 * Document requirement: MODULE G — Input validation for billing operations
 */

const subscribeStripeValidator = [
  body('tier')
    .notEmpty().withMessage('Tier is required')
    .isIn(['premium', 'enterprise']).withMessage('Tier must be premium or enterprise'),

  body('interval')
    .optional()
    .isIn(['monthly', 'annual']).withMessage('Interval must be monthly or annual'),

  body('paymentMethodId')
    .notEmpty().withMessage('Payment method ID is required')
    .isString().withMessage('Payment method ID must be a string'),

  body('billingAddress.name')
    .optional()
    .isString().isLength({ max: 100 }).withMessage('Billing name too long'),

  body('billingAddress.country')
    .optional()
    .isLength({ min: 2, max: 2 }).withMessage('Country must be a 2-letter ISO code'),
];

const subscribeRazorpayValidator = [
  body('tier')
    .notEmpty().withMessage('Tier is required')
    .isIn(['premium', 'enterprise']).withMessage('Tier must be premium or enterprise'),

  body('interval')
    .optional()
    .isIn(['monthly', 'annual']).withMessage('Interval must be monthly or annual'),
];

const confirmRazorpayValidator = [
  body('subscriptionId')
    .notEmpty().withMessage('Subscription ID is required'),

  body('paymentId')
    .notEmpty().withMessage('Payment ID is required'),

  body('signature')
    .notEmpty().withMessage('Signature is required'),
];

const changeTierValidator = [
  body('tier')
    .notEmpty().withMessage('Tier is required')
    .isIn(['free', 'premium', 'enterprise']).withMessage('Invalid tier'),

  body('interval')
    .optional()
    .isIn(['monthly', 'annual']).withMessage('Interval must be monthly or annual'),
];

const checkoutValidator = [
  body('tier')
    .notEmpty().withMessage('Tier is required')
    .isIn(['premium', 'enterprise']).withMessage('Tier must be premium or enterprise'),

  body('interval')
    .optional()
    .isIn(['monthly', 'annual']).withMessage('Interval must be monthly or annual'),
];

module.exports = {
  subscribeStripeValidator,
  subscribeRazorpayValidator,
  confirmRazorpayValidator,
  changeTierValidator,
  checkoutValidator,
};