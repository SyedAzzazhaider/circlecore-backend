const billingService = require('./billing.service');
const invoiceService = require('./invoice.service');
const { PLANS } = require('./plans.config');
const ApiResponse = require('../../utils/apiResponse');
const logger = require('../../utils/logger');

/**
 * Billing Controller
 * Document requirement: MODULE G — Tiered Membership & Billing
 */
class BillingController {

  async getPlans(req, res, next) {
    try {
      const plans = Object.values(PLANS).map(plan => ({
        tier: plan.tier,
        name: plan.name,
        description: plan.description,
        price: plan.price,
        features: plan.features,
        limits: plan.limits,
      }));
      return ApiResponse.success(res, { plans }, 'Plans fetched successfully');
    } catch (error) { next(error); }
  }

  async getSubscription(req, res, next) {
    try {
      const { subscription, plan } = await billingService.getSubscription(req.user._id);
      return ApiResponse.success(res, { subscription, plan }, 'Subscription fetched');
    } catch (error) { next(error); }
  }

  async subscribeWithStripe(req, res, next) {
    try {
      const { tier, interval, paymentMethodId, billingAddress, taxId } = req.body;

      if (!tier || !paymentMethodId) {
        return ApiResponse.error(res, 'tier and paymentMethodId are required', 400);
      }

      const result = await billingService.subscribeWithStripe({
        userId: req.user._id,
        tier,
        interval: interval || 'monthly',
        paymentMethodId,
        billingAddress,
        taxId,
      });

      return ApiResponse.created(res, {
        subscription: result.subscription,
        status: result.stripeSubscription.status,
        currentPeriodEnd: result.subscription.currentPeriodEnd,
      }, 'Subscription created successfully');
    } catch (error) { next(error); }
  }

  async subscribeWithRazorpay(req, res, next) {
    try {
      const { tier, interval, billingAddress } = req.body;

      if (!tier) {
        return ApiResponse.error(res, 'tier is required', 400);
      }

      const result = await billingService.subscribeWithRazorpay({
        userId: req.user._id,
        tier,
        interval: interval || 'monthly',
        billingAddress,
      });

      return ApiResponse.created(res, {
        subscription: result.subscription,
        razorpaySubscriptionId: result.razorpaySubscription.id,
        keyId: result.keyId,
      }, 'Razorpay subscription initialized — complete payment on frontend');
    } catch (error) { next(error); }
  }

  async confirmRazorpayPayment(req, res, next) {
    try {
      const { subscriptionId, paymentId, signature } = req.body;

      if (!subscriptionId || !paymentId || !signature) {
        return ApiResponse.error(res, 'subscriptionId, paymentId, and signature are required', 400);
      }

      const subscription = await billingService.confirmRazorpayPayment({
        userId: req.user._id,
        subscriptionId,
        paymentId,
        signature,
      });

      return ApiResponse.success(res, { subscription }, 'Payment confirmed — subscription activated');
    } catch (error) { next(error); }
  }

  async createStripeCheckout(req, res, next) {
    try {
      const { tier, interval } = req.body;

      if (!tier) {
        return ApiResponse.error(res, 'tier is required', 400);
      }

      const session = await billingService.createCheckoutSession({
        userId: req.user._id,
        tier,
        interval: interval || 'monthly',
      });

      return ApiResponse.success(res, {
        checkoutUrl: session.url,
        sessionId: session.id,
      }, 'Checkout session created');
    } catch (error) { next(error); }
  }

  async getBillingPortal(req, res, next) {
    try {
      const session = await billingService.createBillingPortal(req.user._id);
      return ApiResponse.success(res, { portalUrl: session.url }, 'Billing portal session created');
    } catch (error) { next(error); }
  }

  async cancelSubscription(req, res, next) {
    try {
      const immediately = req.body.immediately === true;
      const subscription = await billingService.cancelSubscription(req.user._id, immediately);
      const message = immediately
        ? 'Subscription cancelled immediately'
        : 'Subscription will cancel at end of billing period';
      return ApiResponse.success(res, { subscription }, message);
    } catch (error) { next(error); }
  }

  async changeTier(req, res, next) {
    try {
      const { tier, interval } = req.body;

      if (!tier) {
        return ApiResponse.error(res, 'tier is required', 400);
      }

      const subscription = await billingService.changeTier(req.user._id, tier, interval || 'monthly');
      return ApiResponse.success(res, { subscription }, 'Subscription tier updated');
    } catch (error) { next(error); }
  }

  async getInvoices(req, res, next) {
    try {
      const { page, limit } = req.query;
      const result = await billingService.getInvoices(req.user._id, { page, limit });
      return ApiResponse.success(res, result, 'Invoices fetched');
    } catch (error) { next(error); }
  }

  async getLiveInvoices(req, res, next) {
    try {
      const invoices = await billingService.getLiveInvoices(req.user._id);
      return ApiResponse.success(res, { invoices }, 'Live invoices fetched');
    } catch (error) { next(error); }
  }

  async getInvoice(req, res, next) {
    try {
      const invoice = await invoiceService.getInvoice(req.params.id, req.user._id);
      return ApiResponse.success(res, { invoice }, 'Invoice fetched');
    } catch (error) { next(error); }
  }

  /**
   * POST /api/billing/webhook/stripe
   * Document requirement: Auto renewals via webhook processing
   *
   * express.raw({ type: '*\/*' }) is applied on this route in billing.routes.js.
   * This makes req.body a Buffer containing the raw request body.
   * We pass it directly to Stripe's signature verification — no conversion needed.
   * The previous req.rawBody || req.body fallback is removed because:
   *   - req.rawBody was set by a custom stream middleware that hung in Jest/supertest
   *   - express.raw() is the official Express way and works in all environments
   */
  async stripeWebhook(req, res, next) {
    try {
      const signature = req.headers['stripe-signature'];
      if (!signature) {
        return res.status(400).json({ success: false, message: 'Missing stripe-signature header' });
      }

      // req.body is a Buffer when express.raw() is used — pass directly to Stripe
      const result = await billingService.handleStripeWebhook(req.body, signature);
      return res.status(200).json(result);
    } catch (error) {
      logger.error('Stripe webhook error: ' + error.message);
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  async razorpayWebhook(req, res, next) {
    try {
      const signature = req.headers['x-razorpay-signature'];
      if (!signature) {
        return res.status(400).json({ success: false, message: 'Missing x-razorpay-signature header' });
      }

      // CC-02 FIX: req.body is now a Buffer (express.raw applied in billing.routes.js).
      // Pass it directly — no JSON.stringify() re-serialization which broke HMAC.
      const rawBody = req.body; // Buffer
      const result = await billingService.handleRazorpayWebhook(rawBody, signature);
      return res.status(200).json(result);
    } catch (error) {
      logger.error('Razorpay webhook error: ' + error.message);
      return res.status(400).json({ success: false, message: error.message });
    }
  }
}

module.exports = new BillingController();