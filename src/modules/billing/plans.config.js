/**
 * Billing Plans Configuration
 * Document requirement: MODULE G — Subscription Tiers
 * Defines Free, Premium, Enterprise tier features and pricing
 *
 * STRIPE PRICE IDs — replace with your actual Stripe price IDs
 * Get them from: https://dashboard.stripe.com/products
 *
 * RAZORPAY PLAN IDs — replace with your actual Razorpay plan IDs
 * Get them from: https://dashboard.razorpay.com/app/subscriptions/plans
 */

const PLANS = {
  // Document requirement: Free tier — invite only, no payment required
  free: {
    name: 'Free',
    tier: 'free',
    description: 'Invite-only access to CircleCore communities',
    price: {
      monthly: 0,
      annual: 0,
      currency: 'usd',
    },
    features: [
      'Join up to 3 communities',
      'Create text posts',
      'Comment & react',
      'Basic profile',
      'In-app notifications',
      'Event RSVP',
    ],
    limits: {
      communities: 3,
      postsPerDay: 10,
      mediaUploadMB: 5,
      channelsPerCommunity: 0,
    },
    stripe: {
      monthlyPriceId: null,  // Free tier has no Stripe price
      annualPriceId: null,
    },
    razorpay: {
      monthlyPlanId: null,   // Free tier has no Razorpay plan
      annualPlanId: null,
    },
  },

  // Document requirement: Premium tier — paid perks
  premium: {
    name: 'Premium',
    tier: 'premium',
    description: 'Full access with premium perks and higher limits',
    price: {
      monthly: 999,    // $9.99 in cents (USD) or ₹999 in paise (INR)
      annual: 9999,    // $99.99/year (save ~17%)
      currency: 'usd',
    },
    features: [
      'Everything in Free',
      'Join unlimited communities',
      'Create polls, resources & file posts',
      'Premium badge on profile',
      'Priority support',
      'Advanced search filters',
      'Email digest customization',
      'Early access to new features',
    ],
    limits: {
      communities: -1,      // unlimited
      postsPerDay: 100,
      mediaUploadMB: 100,
      channelsPerCommunity: 20,
    },
    stripe: {
      // REQUIRED: Replace with your Stripe Price IDs
      // Create at: https://dashboard.stripe.com/products
      monthlyPriceId: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID || 'price_premium_monthly',
      annualPriceId: process.env.STRIPE_PREMIUM_ANNUAL_PRICE_ID || 'price_premium_annual',
    },
    razorpay: {
      // REQUIRED: Replace with your Razorpay Plan IDs
      // Create at: https://dashboard.razorpay.com/app/subscriptions/plans
      monthlyPlanId: process.env.RAZORPAY_PREMIUM_MONTHLY_PLAN_ID || 'plan_premium_monthly',
      annualPlanId: process.env.RAZORPAY_PREMIUM_ANNUAL_PLAN_ID || 'plan_premium_annual',
    },
  },

  // Document requirement: Enterprise tier — white-label + analytics
  enterprise: {
    name: 'Enterprise',
    tier: 'enterprise',
    description: 'White-label solution with analytics and dedicated support',
    price: {
      monthly: 4999,   // $49.99/month
      annual: 49999,   // $499.99/year
      currency: 'usd',
    },
    features: [
      'Everything in Premium',
      'White-label branding',
      'Advanced analytics dashboard',
      'Dedicated account manager',
      'Custom domain support',
      'SSO / SAML integration',
      'API access',
      'SLA guarantee (99.9% uptime)',
      'Custom billing terms',
      'Unlimited media storage',
    ],
    limits: {
      communities: -1,
      postsPerDay: -1,
      mediaUploadMB: -1,
      channelsPerCommunity: -1,
    },
    stripe: {
      // REQUIRED: Replace with your Stripe Price IDs
      monthlyPriceId: process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID || 'price_enterprise_monthly',
      annualPriceId: process.env.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID || 'price_enterprise_annual',
    },
    razorpay: {
      // REQUIRED: Replace with your Razorpay Plan IDs
      monthlyPlanId: process.env.RAZORPAY_ENTERPRISE_MONTHLY_PLAN_ID || 'plan_enterprise_monthly',
      annualPlanId: process.env.RAZORPAY_ENTERPRISE_ANNUAL_PLAN_ID || 'plan_enterprise_annual',
    },
  },
};

/**
 * Get plan configuration by tier
 */
const getPlan = (tier) => {
  return PLANS[tier] || PLANS.free;
};

/**
 * Get Stripe price ID for a tier and billing interval
 */
const getStripePriceId = (tier, interval = 'monthly') => {
  const plan = PLANS[tier];
  if (!plan) return null;
  return interval === 'annual' ? plan.stripe.annualPriceId : plan.stripe.monthlyPriceId;
};

/**
 * Get Razorpay plan ID for a tier and billing interval
 */
const getRazorpayPlanId = (tier, interval = 'monthly') => {
  const plan = PLANS[tier];
  if (!plan) return null;
  return interval === 'annual' ? plan.razorpay.annualPlanId : plan.razorpay.monthlyPlanId;
};

module.exports = { PLANS, getPlan, getStripePriceId, getRazorpayPlanId };