const Subscription = require('../modules/billing/subscription.model');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

/**
 * Billing Middleware
 * Document requirement: MODULE G — Tiered Membership
 * Feature gating based on subscription tier
 * Apply to routes that require Premium or Enterprise tier
 */

/**
 * Require a minimum subscription tier to access a route
 * Usage: router.get('/premium-feature', authenticate, requireTier('premium'), handler)
 */
const requireTier = (minimumTier) => {
  const TIER_LEVELS = { free: 0, premium: 1, enterprise: 2 };

  return async (req, res, next) => {
    try {
      if (!req.user) {
        return ApiResponse.unauthorized(res, 'Authentication required');
      }

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

      // Attach subscription to request for downstream use
      req.subscription = subscription;
      req.userTier = userTier;

      next();
    } catch (error) {
      logger.error('Tier check failed: ' + error.message);
      next(error);
    }
  };
};

/**
 * Attach subscription info to request without blocking
 * Useful for endpoints that behave differently based on tier
 * Usage: router.get('/feed', authenticate, attachSubscription, handler)
 */
const attachSubscription = async (req, res, next) => {
  try {
    if (!req.user) return next();

    const subscription = await Subscription.findOne({ userId: req.user._id });
    req.subscription = subscription;
    req.userTier = subscription?.tier || 'free';
    next();
  } catch (error) {
    // Non-blocking — don't fail the request if subscription lookup fails
    req.userTier = 'free';
    next();
  }
};

/**
 * Check if subscription is active (not past_due or cancelled)
 * Use on billing-sensitive routes
 */
const requireActiveSubscription = async (req, res, next) => {
  try {
    if (!req.user) return ApiResponse.unauthorized(res, 'Authentication required');

    const subscription = await Subscription.findOne({ userId: req.user._id });

    if (!subscription || subscription.tier === 'free') {
      return next(); // Free tier is always "active"
    }

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