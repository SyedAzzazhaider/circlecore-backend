const mongoose = require('mongoose');

/**
 * Subscription Model
 * Document requirement: MODULE G — Tiered Membership & Billing
 * Tracks all subscription data for Free / Premium / Enterprise tiers
 * Supports both Stripe and Razorpay payment providers
 */
const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },

  // Document requirement: Subscription tiers — Free, Premium, Enterprise
  tier: {
    type: String,
    enum: ['free', 'premium', 'enterprise'],
    default: 'free',
  },

  status: {
    type: String,
    enum: ['active', 'inactive', 'cancelled', 'past_due', 'trialing', 'paused'],
    default: 'active',
  },

  // Document requirement: Stripe billing
  stripe: {
    customerId: { type: String, default: null },       // Stripe customer ID
    subscriptionId: { type: String, default: null },   // Stripe subscription ID
    priceId: { type: String, default: null },          // Stripe price ID
    paymentMethodId: { type: String, default: null },  // Stripe payment method
    paymentIntentId: { type: String, default: null },  // Latest payment intent
  },

  // Document requirement: Razorpay billing
  razorpay: {
    customerId: { type: String, default: null },        // Razorpay customer ID
    subscriptionId: { type: String, default: null },    // Razorpay subscription ID
    planId: { type: String, default: null },            // Razorpay plan ID
    paymentId: { type: String, default: null },         // Latest payment ID
  },

  // Active payment provider for this subscription
  provider: {
    type: String,
    enum: ['stripe', 'razorpay', 'none'],
    default: 'none',
  },

  // Document requirement: Auto renewals
  autoRenew: { type: Boolean, default: true },

  // Billing period
  currentPeriodStart: { type: Date, default: null },
  currentPeriodEnd: { type: Date, default: null },

  // Cancellation
  cancelAtPeriodEnd: { type: Boolean, default: false },
  cancelledAt: { type: Date, default: null },
  cancellationReason: { type: String, default: null },

  // Trial period
  trialStart: { type: Date, default: null },
  trialEnd: { type: Date, default: null },

  // Billing address — Document requirement: tax compliant invoices
  billingAddress: {
    name: { type: String, default: '' },
    line1: { type: String, default: '' },
    line2: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    postalCode: { type: String, default: '' },
    country: { type: String, default: '' },
  },

  // Tax information — Document requirement: tax compliant invoices
  taxInfo: {
    taxId: { type: String, default: null },          // VAT / GST number
    taxIdType: { type: String, default: null },       // e.g. 'eu_vat', 'in_gst'
    taxExempt: { type: Boolean, default: false },
  },

  // Metadata
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

}, { timestamps: true });


subscriptionSchema.index({ 'stripe.customerId': 1 });
subscriptionSchema.index({ 'stripe.subscriptionId': 1 });
subscriptionSchema.index({ 'razorpay.subscriptionId': 1 });
subscriptionSchema.index({ status: 1, tier: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);