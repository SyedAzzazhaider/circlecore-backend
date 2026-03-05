const Subscription = require('./subscription.model');
const Profile = require('../users/profile.model');
const User = require('../auth/auth.model');
const stripeService = require('./stripe.service');
const razorpayService = require('./razorpay.service');
const invoiceService = require('./invoice.service');
const { getPlan, getStripePriceId, getRazorpayPlanId } = require('./plans.config');
const logger = require('../../utils/logger');

/**
 * Billing Service
 * Document requirement: MODULE G — Tiered Membership & Billing
 * Orchestrates subscriptions across Stripe and Razorpay
 * Manages tier upgrades/downgrades and auto-renewals
 */
class BillingService {

  /**
   * Get current subscription for a user
   */
  async getSubscription(userId) {
    let subscription = await Subscription.findOne({ userId });

    if (!subscription) {
      // Create a free subscription record if none exists
      subscription = await Subscription.create({
        userId,
        tier: 'free',
        status: 'active',
        provider: 'none',
      });
    }

    const plan = getPlan(subscription.tier);
    return { subscription, plan };
  }

  /**
   * Subscribe via Stripe — creates customer + subscription
   * Document requirement: Stripe billing + Auto renewals
   */
  async subscribeWithStripe({ userId, tier, interval, paymentMethodId, billingAddress, taxId }) {
    const user = await User.findById(userId).select('name email');
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

    if (tier === 'free') throw Object.assign(new Error('Cannot subscribe to free tier via billing'), { statusCode: 400 });

    const priceId = getStripePriceId(tier, interval);
    if (!priceId) throw Object.assign(new Error('Invalid tier or interval'), { statusCode: 400 });

    let subscription = await Subscription.findOne({ userId });
    if (!subscription) {
      subscription = new Subscription({ userId, tier: 'free', status: 'active', provider: 'none' });
    }

    // Create Stripe customer if not exists
    let stripeCustomerId = subscription.stripe?.customerId;
    if (!stripeCustomerId) {
      const customer = await stripeService.createCustomer(user);
      stripeCustomerId = customer.id;
    }

    // Create Stripe subscription
    const stripeSubscription = await stripeService.createSubscription({
      customerId: stripeCustomerId,
      priceId,
      paymentMethodId,
      billingAddress,
      taxId,
    });

    // Update subscription record
    subscription.tier = tier;
    subscription.status = this._mapStripeStatus(stripeSubscription.status);
    subscription.provider = 'stripe';
    subscription.autoRenew = true;
    subscription.stripe = {
      customerId: stripeCustomerId,
      subscriptionId: stripeSubscription.id,
      priceId,
      paymentMethodId,
      paymentIntentId: stripeSubscription.latest_invoice?.payment_intent?.id || null,
    };
    subscription.currentPeriodStart = new Date(stripeSubscription.current_period_start * 1000);
    subscription.currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
    subscription.cancelAtPeriodEnd = false;
    if (billingAddress) subscription.billingAddress = billingAddress;
    if (taxId) subscription.taxInfo = { taxId: taxId.value, taxIdType: taxId.type };

    await subscription.save();

    // Update profile tier
    await Profile.findOneAndUpdate({ userId }, { tier });

    logger.info('Stripe subscription created for user: ' + userId + ' tier: ' + tier);
    return { subscription, stripeSubscription };
  }

  /**
   * Subscribe via Razorpay — creates customer + subscription
   * Document requirement: Razorpay billing + Auto renewals
   */
  async subscribeWithRazorpay({ userId, tier, interval, billingAddress }) {
    const user = await User.findById(userId).select('name email');
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

    if (tier === 'free') throw Object.assign(new Error('Cannot subscribe to free tier via billing'), { statusCode: 400 });

    const planId = getRazorpayPlanId(tier, interval);
    if (!planId) throw Object.assign(new Error('Invalid tier or interval'), { statusCode: 400 });

    let subscription = await Subscription.findOne({ userId });
    if (!subscription) {
      subscription = new Subscription({ userId, tier: 'free', status: 'active', provider: 'none' });
    }

    // Create Razorpay customer if not exists
    let razorpayCustomerId = subscription.razorpay?.customerId;
    if (!razorpayCustomerId) {
      const customer = await razorpayService.createCustomer(user);
      razorpayCustomerId = customer.id;
    }

    // Total billing cycles: 12 months for both monthly and annual
    const totalCount = interval === 'annual' ? 1 : 12;

    // Create Razorpay subscription
    const razorpaySubscription = await razorpayService.createSubscription({
      planId,
      customerId: razorpayCustomerId,
      totalCount,
      userId,
      tier,
    });

    // Update subscription record — pending payment confirmation
    subscription.tier = tier;
    subscription.status = 'inactive'; // Activated after payment confirmed
    subscription.provider = 'razorpay';
    subscription.autoRenew = true;
    subscription.razorpay = {
      customerId: razorpayCustomerId,
      subscriptionId: razorpaySubscription.id,
      planId,
    };
    if (billingAddress) subscription.billingAddress = billingAddress;

    await subscription.save();

    logger.info('Razorpay subscription created for user: ' + userId + ' tier: ' + tier);
    return {
      subscription,
      razorpaySubscription,
      // Return these to frontend for Razorpay checkout
      keyId: process.env.RAZORPAY_KEY_ID,
      subscriptionId: razorpaySubscription.id,
    };
  }

  /**
   * Confirm Razorpay payment after frontend checkout
   * Document requirement: Auto renewals — verify and activate
   */
  async confirmRazorpayPayment({ userId, subscriptionId, paymentId, signature }) {
    // Verify payment signature
    razorpayService.verifyPaymentSignature({ subscriptionId, paymentId, signature });

    const subscription = await Subscription.findOne({ userId, 'razorpay.subscriptionId': subscriptionId });
    if (!subscription) throw Object.assign(new Error('Subscription not found'), { statusCode: 404 });

    // Activate subscription
    subscription.status = 'active';
    subscription.razorpay.paymentId = paymentId;

    // Set period (monthly = 30 days from now)
    const now = new Date();
    subscription.currentPeriodStart = now;
    subscription.currentPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await subscription.save();

    // Update profile tier
    await Profile.findOneAndUpdate({ userId: subscription.userId }, { tier: subscription.tier });

    logger.info('Razorpay payment confirmed for user: ' + userId);
    return subscription;
  }

  /**
   * Cancel subscription
   * Document requirement: Auto renewals — user can cancel
   */
  async cancelSubscription(userId, cancelImmediately = false) {
    const subscription = await Subscription.findOne({ userId });
    if (!subscription || subscription.tier === 'free') {
      throw Object.assign(new Error('No active subscription to cancel'), { statusCode: 400 });
    }

    if (subscription.provider === 'stripe' && subscription.stripe.subscriptionId) {
      await stripeService.cancelSubscription(subscription.stripe.subscriptionId, cancelImmediately);
    } else if (subscription.provider === 'razorpay' && subscription.razorpay.subscriptionId) {
      await razorpayService.cancelSubscription(subscription.razorpay.subscriptionId, !cancelImmediately);
    }

    if (cancelImmediately) {
      subscription.tier = 'free';
      subscription.status = 'cancelled';
      subscription.cancelledAt = new Date();
      subscription.autoRenew = false;
      await Profile.findOneAndUpdate({ userId }, { tier: 'standard' });
    } else {
      subscription.cancelAtPeriodEnd = true;
      subscription.autoRenew = false;
    }

    await subscription.save();
    logger.info('Subscription cancelled for user: ' + userId + ' immediately: ' + cancelImmediately);
    return subscription;
  }

  /**
   * Upgrade or downgrade subscription tier
   */
  async changeTier(userId, newTier, interval) {
    const subscription = await Subscription.findOne({ userId });
    if (!subscription) throw Object.assign(new Error('Subscription not found'), { statusCode: 404 });

    if (subscription.tier === newTier) {
      throw Object.assign(new Error('Already on this tier'), { statusCode: 400 });
    }

    if (subscription.provider === 'stripe' && subscription.stripe.subscriptionId) {
      const newPriceId = getStripePriceId(newTier, interval);
      if (!newPriceId) throw Object.assign(new Error('Invalid tier'), { statusCode: 400 });
      await stripeService.updateSubscription(subscription.stripe.subscriptionId, newPriceId);
      subscription.stripe.priceId = newPriceId;
    }

    subscription.tier = newTier;
    await subscription.save();

    // Update profile tier
    const tierMap = { free: 'standard', premium: 'premium', enterprise: 'enterprise' };
    await Profile.findOneAndUpdate({ userId }, { tier: tierMap[newTier] || 'standard' });

    logger.info('Tier changed for user: ' + userId + ' to: ' + newTier);
    return subscription;
  }

  /**
   * Create Stripe Checkout Session — hosted payment page approach
   */
  async createCheckoutSession({ userId, tier, interval }) {
    const user = await User.findById(userId).select('name email');
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

    const priceId = getStripePriceId(tier, interval);
    if (!priceId) throw Object.assign(new Error('Invalid tier or interval'), { statusCode: 400 });

    let subscription = await Subscription.findOne({ userId });
    if (!subscription) {
      subscription = new Subscription({ userId, tier: 'free', status: 'active', provider: 'none' });
      await subscription.save();
    }

    let stripeCustomerId = subscription.stripe?.customerId;
    if (!stripeCustomerId) {
      const customer = await stripeService.createCustomer(user);
      stripeCustomerId = customer.id;
      subscription.stripe = subscription.stripe || {};
      subscription.stripe.customerId = stripeCustomerId;
      await subscription.save();
    }

    const session = await stripeService.createCheckoutSession({
      customerId: stripeCustomerId,
      priceId,
      successUrl: (process.env.FRONTEND_URL || 'http://localhost:3000') + '/billing/success',
      cancelUrl: (process.env.FRONTEND_URL || 'http://localhost:3000') + '/billing/cancel',
      userId,
      tier,
    });

    return session;
  }

  /**
   * Create Stripe Billing Portal session — lets users manage their own billing
   */
  async createBillingPortal(userId) {
    const subscription = await Subscription.findOne({ userId });
    if (!subscription?.stripe?.customerId) {
      throw Object.assign(new Error('No Stripe billing account found'), { statusCode: 400 });
    }

    const session = await stripeService.createBillingPortalSession(
      subscription.stripe.customerId,
      (process.env.FRONTEND_URL || 'http://localhost:3000') + '/billing'
    );

    return session;
  }

  /**
   * Get user invoices from database
   */
  async getInvoices(userId, options) {
    return invoiceService.getUserInvoices(userId, options);
  }

  /**
   * Get invoices from payment provider (live data)
   */
  async getLiveInvoices(userId) {
    const subscription = await Subscription.findOne({ userId });
    if (!subscription) return [];

    if (subscription.provider === 'stripe' && subscription.stripe?.customerId) {
      return stripeService.getInvoices(subscription.stripe.customerId);
    }

    if (subscription.provider === 'razorpay' && subscription.razorpay?.subscriptionId) {
      return razorpayService.getInvoices(subscription.razorpay.subscriptionId);
    }

    return [];
  }

  /**
   * Handle Stripe webhook events
   * Document requirement: Auto renewals — process renewal events
   */
  async handleStripeWebhook(rawBody, signature) {
    const event = stripeService.verifyWebhookSignature(rawBody, signature);

    logger.info('Stripe webhook received: ' + event.type);

    switch (event.type) {

      case 'customer.subscription.updated': {
        const stripeSubscription = event.data.object;
        await this._syncStripeSubscription(stripeSubscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const stripeSubscription = event.data.object;
        const subscription = await Subscription.findOne({
          'stripe.subscriptionId': stripeSubscription.id,
        });
        if (subscription) {
          subscription.tier = 'free';
          subscription.status = 'cancelled';
          subscription.cancelledAt = new Date();
          subscription.autoRenew = false;
          await subscription.save();
          await Profile.findOneAndUpdate({ userId: subscription.userId }, { tier: 'standard' });
          logger.info('Subscription cancelled via webhook for user: ' + subscription.userId);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const stripeInvoice = event.data.object;
        await this._handleStripeInvoicePaid(stripeInvoice);
        break;
      }

      case 'invoice.payment_failed': {
        const stripeInvoice = event.data.object;
        const subscription = await Subscription.findOne({
          'stripe.subscriptionId': stripeInvoice.subscription,
        });
        if (subscription) {
          subscription.status = 'past_due';
          await subscription.save();
          logger.warn('Payment failed for subscription: ' + subscription._id);
        }
        break;
      }

      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription' && session.metadata?.userId) {
          await this._handleCheckoutCompleted(session);
        }
        break;
      }

      default:
        logger.info('Unhandled Stripe webhook event: ' + event.type);
    }

    return { received: true };
  }

  /**
   * Handle Razorpay webhook events
   */
  async handleRazorpayWebhook(rawBody, signature) {
    razorpayService.verifyWebhookSignature(rawBody, signature);

    const event = JSON.parse(rawBody);
    logger.info('Razorpay webhook received: ' + event.event);

    switch (event.event) {

      case 'subscription.activated': {
        const rpSub = event.payload.subscription.entity;
        const subscription = await Subscription.findOne({
          'razorpay.subscriptionId': rpSub.id,
        });
        if (subscription) {
          subscription.status = 'active';
          await subscription.save();
          await Profile.findOneAndUpdate({ userId: subscription.userId }, { tier: subscription.tier });
        }
        break;
      }

      case 'subscription.cancelled': {
        const rpSub = event.payload.subscription.entity;
        const subscription = await Subscription.findOne({
          'razorpay.subscriptionId': rpSub.id,
        });
        if (subscription) {
          subscription.tier = 'free';
          subscription.status = 'cancelled';
          subscription.autoRenew = false;
          subscription.cancelledAt = new Date();
          await subscription.save();
          await Profile.findOneAndUpdate({ userId: subscription.userId }, { tier: 'standard' });
        }
        break;
      }

      case 'payment.captured': {
        const payment = event.payload.payment.entity;
        if (payment.subscription_id) {
          const subscription = await Subscription.findOne({
            'razorpay.subscriptionId': payment.subscription_id,
          });
          if (subscription) {
            subscription.status = 'active';
            subscription.razorpay.paymentId = payment.id;
            const now = new Date();
            subscription.currentPeriodStart = now;
            subscription.currentPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            await subscription.save();

            // Create invoice record
            try {
              const user = await User.findById(subscription.userId).select('name email');
              await invoiceService.createFromRazorpayPayment(
                payment,
                subscription.userId,
                subscription._id,
                subscription.tier,
                subscription.currentPeriodStart,
                subscription.currentPeriodEnd
              );
            } catch (e) {
              logger.warn('Invoice creation failed: ' + e.message);
            }
          }
        }
        break;
      }

      case 'payment.failed': {
        const payment = event.payload.payment.entity;
        if (payment.subscription_id) {
          const subscription = await Subscription.findOne({
            'razorpay.subscriptionId': payment.subscription_id,
          });
          if (subscription) {
            subscription.status = 'past_due';
            await subscription.save();
          }
        }
        break;
      }

      default:
        logger.info('Unhandled Razorpay webhook event: ' + event.event);
    }

    return { received: true };
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  async _syncStripeSubscription(stripeSubscription) {
    const subscription = await Subscription.findOne({
      'stripe.subscriptionId': stripeSubscription.id,
    });
    if (!subscription) return;

    subscription.status = this._mapStripeStatus(stripeSubscription.status);
    subscription.currentPeriodStart = new Date(stripeSubscription.current_period_start * 1000);
    subscription.currentPeriodEnd = new Date(stripeSubscription.current_period_end * 1000);
    subscription.cancelAtPeriodEnd = stripeSubscription.cancel_at_period_end;
    if (stripeSubscription.cancel_at_period_end) {
      subscription.autoRenew = false;
    }

    await subscription.save();
    logger.info('Stripe subscription synced: ' + stripeSubscription.id);
  }

  async _handleStripeInvoicePaid(stripeInvoice) {
    const subscription = await Subscription.findOne({
      'stripe.subscriptionId': stripeInvoice.subscription,
    });
    if (!subscription) return;

    // Ensure subscription is active after successful payment
    subscription.status = 'active';
    await subscription.save();

    // Create invoice record in DB
    try {
      await invoiceService.createFromStripeInvoice(
        stripeInvoice,
        subscription.userId,
        subscription._id,
        subscription.tier
      );
    } catch (e) {
      logger.warn('Invoice save failed: ' + e.message);
    }
  }

  async _handleCheckoutCompleted(session) {
    const { userId, tier } = session.metadata;
    const subscription = await Subscription.findOne({ userId });
    if (!subscription) return;

    subscription.tier = tier;
    subscription.status = 'active';
    subscription.provider = 'stripe';
    subscription.stripe = subscription.stripe || {};
    subscription.stripe.subscriptionId = session.subscription;
    subscription.autoRenew = true;
    await subscription.save();

    const tierMap = { premium: 'premium', enterprise: 'enterprise' };
    await Profile.findOneAndUpdate({ userId }, { tier: tierMap[tier] || 'standard' });

    logger.info('Checkout completed for user: ' + userId + ' tier: ' + tier);
  }

  _mapStripeStatus(stripeStatus) {
    const map = {
      active: 'active',
      past_due: 'past_due',
      canceled: 'cancelled',
      incomplete: 'inactive',
      incomplete_expired: 'inactive',
      trialing: 'trialing',
      paused: 'paused',
      unpaid: 'past_due',
    };
    return map[stripeStatus] || 'inactive';
  }
}

module.exports = new BillingService();