const logger = require('../../utils/logger');

/**
 * Razorpay Service
 * Document requirement: MODULE G — Razorpay billing
 *
 * REQUIRED: Razorpay API Keys
 * Get your keys at: https://dashboard.razorpay.com/app/keys
 *
 * Add to your .env file:
 *   RAZORPAY_KEY_ID=rzp_live_...          (or rzp_test_... for testing)
 *   RAZORPAY_KEY_SECRET=...
 *   RAZORPAY_WEBHOOK_SECRET=...           (set in Razorpay webhook settings)
 *   RAZORPAY_PREMIUM_MONTHLY_PLAN_ID=plan_...
 *   RAZORPAY_PREMIUM_ANNUAL_PLAN_ID=plan_...
 *   RAZORPAY_ENTERPRISE_MONTHLY_PLAN_ID=plan_...
 *   RAZORPAY_ENTERPRISE_ANNUAL_PLAN_ID=plan_...
 *
 * To create plans in Razorpay:
 *   1. Go to https://dashboard.razorpay.com/app/subscriptions/plans
 *   2. Create "CircleCore Premium" and "CircleCore Enterprise" plans
 *   3. Copy the plan IDs (plan_xxx) to your .env file
 *
 * To set up webhooks:
 *   1. Go to https://dashboard.razorpay.com/app/webhooks
 *   2. Add endpoint: https://yourdomain.com/api/billing/webhook/razorpay
 *   3. Select events: subscription.*, payment.*
 *   4. Copy the webhook secret to RAZORPAY_WEBHOOK_SECRET in .env
 */

const crypto = require('crypto');

let razorpay = null;

const getRazorpay = () => {
  if (!razorpay) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET not configured in .env');
    }
    const Razorpay = require('razorpay');
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpay;
};

class RazorpayService {

  /**
   * Create a Razorpay customer
   */
  async createCustomer(user) {
    try {
      const rp = getRazorpay();
      const customer = await rp.customers.create({
        name: user.name,
        email: user.email,
        contact: user.phone || '',
        notes: {
          userId: user._id.toString(),
          platform: 'CircleCore',
        },
      });
      logger.info('Razorpay customer created: ' + customer.id + ' for user: ' + user._id);
      return customer;
    } catch (error) {
      logger.error('Razorpay create customer failed: ' + error.message);
      throw Object.assign(new Error('Failed to create billing customer: ' + error.message), { statusCode: 500 });
    }
  }

  /**
   * Create a Razorpay subscription
   * Document requirement: Auto renewals — Razorpay handles auto-renewal via recurring payments
   */
  async createSubscription({ planId, customerId, totalCount, userId, tier }) {
    try {
      const rp = getRazorpay();

      const subscription = await rp.subscriptions.create({
        plan_id: planId,
        customer_notify: 1,              // Razorpay notifies customer via email
        total_count: totalCount || 12,   // 12 months for annual, 12 for monthly (1 year)
        quantity: 1,
        notes: {
          userId: userId.toString(),
          tier: tier,
          platform: 'CircleCore',
        },
      });

      logger.info('Razorpay subscription created: ' + subscription.id);
      return subscription;
    } catch (error) {
      logger.error('Razorpay create subscription failed: ' + error.message);
      throw Object.assign(new Error('Subscription creation failed: ' + error.message), { statusCode: 400 });
    }
  }

  /**
   * Cancel a Razorpay subscription
   */
  async cancelSubscription(subscriptionId, cancelAtCycleEnd = true) {
    try {
      const rp = getRazorpay();
      const subscription = await rp.subscriptions.cancel(subscriptionId, cancelAtCycleEnd);
      logger.info('Razorpay subscription cancelled: ' + subscriptionId);
      return subscription;
    } catch (error) {
      logger.error('Razorpay cancel subscription failed: ' + error.message);
      throw Object.assign(new Error('Cancellation failed: ' + error.message), { statusCode: 400 });
    }
  }

  /**
   * Fetch subscription details
   */
  async getSubscription(subscriptionId) {
    try {
      const rp = getRazorpay();
      return await rp.subscriptions.fetch(subscriptionId);
    } catch (error) {
      throw Object.assign(new Error('Could not retrieve subscription: ' + error.message), { statusCode: 404 });
    }
  }

  /**
   * Fetch all invoices (payments) for a subscription
   * Document requirement: tax compliant invoices
   */
  async getInvoices(subscriptionId) {
    try {
      const rp = getRazorpay();
      const invoices = await rp.invoices.all({
        subscription_id: subscriptionId,
        count: 20,
      });
      return invoices.items;
    } catch (error) {
      logger.error('Razorpay get invoices failed: ' + error.message);
      throw Object.assign(new Error('Could not retrieve invoices: ' + error.message), { statusCode: 500 });
    }
  }

  /**
   * Verify Razorpay payment signature — security requirement
   * Called after frontend payment completion
   */
  verifyPaymentSignature({ subscriptionId, paymentId, signature }) {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(paymentId + '|' + subscriptionId)
        .digest('hex');

      const isValid = expectedSignature === signature;
      if (!isValid) {
        throw Object.assign(new Error('Invalid payment signature'), { statusCode: 400 });
      }
      return true;
    } catch (error) {
      throw Object.assign(new Error('Payment verification failed: ' + error.message), { statusCode: 400 });
    }
  }

  /**
   * Verify Razorpay webhook signature
   */
  verifyWebhookSignature(rawBody, signature) {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex');

      if (expectedSignature !== signature) {
        throw Object.assign(new Error('Webhook signature verification failed'), { statusCode: 400 });
      }
      return true;
    } catch (error) {
      throw Object.assign(new Error('Webhook verification failed: ' + error.message), { statusCode: 400 });
    }
  }

  /**
   * Fetch a specific payment
   */
  async getPayment(paymentId) {
    try {
      const rp = getRazorpay();
      return await rp.payments.fetch(paymentId);
    } catch (error) {
      throw Object.assign(new Error('Payment not found: ' + error.message), { statusCode: 404 });
    }
  }
}

module.exports = new RazorpayService();