const logger = require('../../utils/logger');

/**
 * Stripe Service
 * Document requirement: MODULE G — Stripe billing
 *
 * REQUIRED: Stripe API Keys
 * Get your keys at: https://dashboard.stripe.com/apikeys
 *
 * Add to your .env file:
 *   STRIPE_SECRET_KEY=sk_live_...         (or sk_test_... for testing)
 *   STRIPE_WEBHOOK_SECRET=whsec_...       (from Stripe webhook dashboard)
 *   STRIPE_PREMIUM_MONTHLY_PRICE_ID=price_...
 *   STRIPE_PREMIUM_ANNUAL_PRICE_ID=price_...
 *   STRIPE_ENTERPRISE_MONTHLY_PRICE_ID=price_...
 *   STRIPE_ENTERPRISE_ANNUAL_PRICE_ID=price_...
 *
 * To create products and prices in Stripe:
 *   1. Go to https://dashboard.stripe.com/products
 *   2. Create "CircleCore Premium" and "CircleCore Enterprise" products
 *   3. Add monthly and annual prices to each product
 *   4. Copy the price IDs (price_xxx) to your .env file
 *
 * To set up webhooks:
 *   1. Go to https://dashboard.stripe.com/webhooks
 *   2. Add endpoint: https://yourdomain.com/api/billing/webhook/stripe
 *   3. Select events: customer.subscription.*, invoice.*, payment_intent.*
 *   4. Copy the webhook signing secret to STRIPE_WEBHOOK_SECRET in .env
 */

let stripe = null;

const getStripe = () => {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY not configured in .env');
    }
    // Stripe is loaded lazily so tests don't fail without keys
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
};

class StripeService {

  /**
   * Create a Stripe customer for a user
   */
  async createCustomer(user) {
    try {
      const s = getStripe();
      const customer = await s.customers.create({
        email: user.email,
        name: user.name,
        metadata: {
          userId: user._id.toString(),
          platform: 'CircleCore',
        },
      });
      logger.info('Stripe customer created: ' + customer.id + ' for user: ' + user._id);
      return customer;
    } catch (error) {
      logger.error('Stripe create customer failed: ' + error.message);
      throw Object.assign(new Error('Failed to create billing customer: ' + error.message), { statusCode: 500 });
    }
  }

  /**
   * Create a Stripe subscription
   * Document requirement: Auto renewals — Stripe handles auto-renewal by default
   */
  async createSubscription({ customerId, priceId, paymentMethodId, billingAddress, taxId }) {
    try {
      const s = getStripe();

      // Attach payment method to customer
      await s.paymentMethods.attach(paymentMethodId, { customer: customerId });

      // Set as default payment method
      await s.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });

      // Build subscription params
      const params = {
        customer: customerId,
        items: [{ price: priceId }],
        payment_settings: {
          payment_method_types: ['card'],
          save_default_payment_method: 'on_subscription',
        },
        expand: ['latest_invoice.payment_intent'],
        metadata: { platform: 'CircleCore' },
      };

      // Add tax info if provided — Document requirement: tax compliant invoices
      if (taxId) {
        try {
          const taxIdObj = await s.customers.createTaxId(customerId, {
            type: taxId.type,
            value: taxId.value,
          });
          params.metadata.taxIdId = taxIdObj.id;
        } catch (taxErr) {
          logger.warn('Tax ID creation failed: ' + taxErr.message);
        }
      }

      // Add billing address for invoices
      if (billingAddress && billingAddress.line1) {
        await s.customers.update(customerId, {
          address: {
            line1: billingAddress.line1,
            line2: billingAddress.line2 || '',
            city: billingAddress.city,
            state: billingAddress.state,
            postal_code: billingAddress.postalCode,
            country: billingAddress.country,
          },
          name: billingAddress.name,
        });
      }

      const subscription = await s.subscriptions.create(params);
      logger.info('Stripe subscription created: ' + subscription.id);
      return subscription;
    } catch (error) {
      logger.error('Stripe create subscription failed: ' + error.message);
      throw Object.assign(new Error('Subscription creation failed: ' + error.message), { statusCode: 400 });
    }
  }

  /**
   * Cancel a Stripe subscription
   * Document requirement: Auto renewals — can disable
   */
  async cancelSubscription(subscriptionId, immediately = false) {
    try {
      const s = getStripe();
      let subscription;

      if (immediately) {
        // Cancel immediately — no access after cancellation
        subscription = await s.subscriptions.cancel(subscriptionId);
      } else {
        // Cancel at end of billing period — user keeps access until period ends
        subscription = await s.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        });
      }

      logger.info('Stripe subscription cancelled: ' + subscriptionId + ' immediately: ' + immediately);
      return subscription;
    } catch (error) {
      logger.error('Stripe cancel subscription failed: ' + error.message);
      throw Object.assign(new Error('Cancellation failed: ' + error.message), { statusCode: 400 });
    }
  }

  /**
   * Resume a cancelled subscription (undo cancel_at_period_end)
   */
  async resumeSubscription(subscriptionId) {
    try {
      const s = getStripe();
      const subscription = await s.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      });
      logger.info('Stripe subscription resumed: ' + subscriptionId);
      return subscription;
    } catch (error) {
      logger.error('Stripe resume subscription failed: ' + error.message);
      throw Object.assign(new Error('Resume failed: ' + error.message), { statusCode: 400 });
    }
  }

  /**
   * Change subscription tier (upgrade or downgrade)
   */
  async updateSubscription(subscriptionId, newPriceId) {
    try {
      const s = getStripe();
      const subscription = await s.subscriptions.retrieve(subscriptionId);

      const updatedSubscription = await s.subscriptions.update(subscriptionId, {
        items: [{
          id: subscription.items.data[0].id,
          price: newPriceId,
        }],
        proration_behavior: 'create_prorations', // Charge/credit prorated amount
      });

      logger.info('Stripe subscription updated: ' + subscriptionId + ' to price: ' + newPriceId);
      return updatedSubscription;
    } catch (error) {
      logger.error('Stripe update subscription failed: ' + error.message);
      throw Object.assign(new Error('Update failed: ' + error.message), { statusCode: 400 });
    }
  }

  /**
   * Retrieve Stripe subscription details
   */
  async getSubscription(subscriptionId) {
    try {
      const s = getStripe();
      return await s.subscriptions.retrieve(subscriptionId, {
        expand: ['latest_invoice', 'customer'],
      });
    } catch (error) {
      throw Object.assign(new Error('Could not retrieve subscription: ' + error.message), { statusCode: 404 });
    }
  }

  /**
   * List all invoices for a customer — Document requirement: tax compliant invoices
   */
  async getInvoices(customerId, limit = 10) {
    try {
      const s = getStripe();
      const invoices = await s.invoices.list({
        customer: customerId,
        limit,
        expand: ['data.payment_intent'],
      });
      return invoices.data;
    } catch (error) {
      logger.error('Stripe get invoices failed: ' + error.message);
      throw Object.assign(new Error('Could not retrieve invoices: ' + error.message), { statusCode: 500 });
    }
  }

  /**
   * Get a specific invoice with PDF URL
   */
  async getInvoice(invoiceId) {
    try {
      const s = getStripe();
      return await s.invoices.retrieve(invoiceId);
    } catch (error) {
      throw Object.assign(new Error('Invoice not found: ' + error.message), { statusCode: 404 });
    }
  }

  /**
   * Create a Stripe Checkout Session (hosted payment page)
   * Alternative to manual card entry — easier to implement
   */
  async createCheckoutSession({ customerId, priceId, successUrl, cancelUrl, userId, tier }) {
    try {
      const s = getStripe();
      const session = await s.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl + '?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: cancelUrl,
        metadata: { userId: userId.toString(), tier },
        subscription_data: {
          metadata: { userId: userId.toString(), tier, platform: 'CircleCore' },
        },
        // Document requirement: tax compliant invoices — auto tax calculation
        automatic_tax: { enabled: false }, // Set to true if you have Stripe Tax configured
        tax_id_collection: { enabled: true },
        customer_update: {
          address: 'auto',
          name: 'auto',
        },
      });
      return session;
    } catch (error) {
      logger.error('Stripe checkout session failed: ' + error.message);
      throw Object.assign(new Error('Checkout session failed: ' + error.message), { statusCode: 400 });
    }
  }

  /**
   * Create a Billing Portal session — lets users manage subscription themselves
   */
  async createBillingPortalSession(customerId, returnUrl) {
    try {
      const s = getStripe();
      const session = await s.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      return session;
    } catch (error) {
      logger.error('Stripe billing portal failed: ' + error.message);
      throw Object.assign(new Error('Billing portal failed: ' + error.message), { statusCode: 400 });
    }
  }

  /**
   * Verify Stripe webhook signature — security requirement
   */
  verifyWebhookSignature(rawBody, signature) {
    try {
      const s = getStripe();
      return s.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (error) {
      throw Object.assign(new Error('Webhook signature verification failed: ' + error.message), { statusCode: 400 });
    }
  }
}

module.exports = new StripeService();