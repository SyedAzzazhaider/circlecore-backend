const Subscription = require('../modules/billing/subscription.model');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');
const { TIER_LEVELS } = require('../constants/tiers');

/**
 * Billing Middleware
 * CC-01 + CC-23 FIX: TIER_LEVELS imported from canonical src/constants/tiers.js
 * Previously defined inline — now single source of truth.
 */

const requireTier = (minimumTier) => {
  return async (req, res, next) => {
    try {
      if (!req.user) return ApiResponse.unauthorized(res, 'Authentication required');

      const subscription = await Subscription.findOne({
        userId: req.user._id,
        status: { $in: ['active', 'trialing'] },
      });

      const userTier = subscription?.tier || 'free';
      const userLevel = TIER_LEVELS[userTier] ?? 0;
      const requiredLevel = TIER_LEVELS[minimumTier] ?? 0;

      if (userLevel < requiredLevel) {
        return res.status(403).json({
          success: false,
          message: 'This feature requires ' + minimumTier.charAt(0).toUpperCase() + minimumTier.slice(1) + ' plan or higher',
          upgradeRequired: true,
          currentTier: userTier,
          requiredTier: minimumTier,
        });
      }

      req.subscription = subscription;
      req.userTier = userTier;
      next();
    } catch (error) {
      logger.error('Tier check failed: ' + error.message);
      next(error);
    }
  };
};

const attachSubscription = async (req, res, next) => {
  try {
    if (!req.user) return next();
    const subscription = await Subscription.findOne({ userId: req.user._id });
    req.subscription = subscription;
    req.userTier = subscription?.tier || 'free';
    next();
  } catch (error) {
    req.userTier = 'free';
    next();
  }
};

const requireActiveSubscription = async (req, res, next) => {
  try {
    if (!req.user) return ApiResponse.unauthorized(res, 'Authentication required');
    const subscription = await Subscription.findOne({ userId: req.user._id });
    if (!subscription || subscription.tier === 'free') return next();
    if (!['active', 'trialing'].includes(subscription.status)) {
      return res.status(402).json({
        success: false,
        message: 'Your subscription is ' + subscription.status + '. Please update your payment method.',
        subscriptionStatus: subscription.status,
        paymentRequired: true,
      });
    }
    req.subscription = subscription;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { requireTier, attachSubscription, requireActiveSubscription };
