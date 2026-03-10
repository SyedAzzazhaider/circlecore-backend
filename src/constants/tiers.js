/**
 * Canonical Tier Constants
 * CC-01 FIX: Single source of truth for all tier values.
 *
 * Previously profile.model.js used 'standard'/'premium'/'mod'
 * while billing used 'free'/'premium'/'enterprise' — causing silent
 * data corruption when enterprise subscribers had their tier written
 * to Profile documents.
 *
 * All models, services, and middleware must import from here.
 */

const TIERS = {
  FREE:       'free',
  PREMIUM:    'premium',
  ENTERPRISE: 'enterprise',
  MOD:        'mod',        // Non-billing tier — awarded by admins for moderators
};

// Numeric levels for feature gating comparisons
const TIER_LEVELS = {
  [TIERS.FREE]:       0,
  [TIERS.PREMIUM]:    1,
  [TIERS.ENTERPRISE]: 2,
  [TIERS.MOD]:        1, // Mods get premium-level feature access
};

// Tiers that are managed by the billing system (Stripe / Razorpay)
const BILLING_TIERS = [TIERS.FREE, TIERS.PREMIUM, TIERS.ENTERPRISE];

// Tiers valid on the Profile document
const PROFILE_TIERS = Object.values(TIERS);

module.exports = { TIERS, TIER_LEVELS, BILLING_TIERS, PROFILE_TIERS };
