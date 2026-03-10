const express = require('express');
const router = express.Router();
const billingController = require('./billing.controller');
const { authenticate } = require('../../middleware/authenticate');
const { billingLimiter } = require('../../middleware/rateLimiter');
const {
  subscribeStripeValidator,
  subscribeRazorpayValidator,
  confirmRazorpayValidator,
  changeTierValidator,
  checkoutValidator,
} = require('./billing.validators');
const validate = require('../../middleware/validate');

/**
 * Billing Routes — MODULE G
 *
 * CC-02 FIX: Razorpay webhook now uses express.raw({ type: '*\/*' })
 *   identical to Stripe, so req.body arrives as a Buffer.
 *   The controller passes it directly to billingService — no re-serialization.
 *
 * CC-06 FIX: billing.validators.js is now imported and applied to all
 *   mutating billing routes. Previously these validators existed but were
 *   never wired up, allowing malformed bodies to reach Stripe/Razorpay APIs.
 */

// ─── Public Routes ────────────────────────────────────────────────────────────
router.get('/plans', billingController.getPlans);

// ─── Webhook Routes ───────────────────────────────────────────────────────────
// Stripe: express.raw() required for HMAC verification
router.post(
  '/webhook/stripe',
  express.raw({ type: '*/*' }),
  billingController.stripeWebhook
);

// CC-02 FIX: express.raw() added — req.body is now a Buffer, not parsed JSON
router.post(
  '/webhook/razorpay',
  express.raw({ type: '*/*' }),
  billingController.razorpayWebhook
);

// ─── Protected Routes ─────────────────────────────────────────────────────────
router.get('/subscription',  authenticate, billingController.getSubscription);

// CC-06 FIX: validators applied
router.post('/subscribe/stripe',
  authenticate, billingLimiter,
  subscribeStripeValidator, validate,
  billingController.subscribeWithStripe
);

router.post('/subscribe/razorpay',
  authenticate, billingLimiter,
  subscribeRazorpayValidator, validate,
  billingController.subscribeWithRazorpay
);

router.post('/subscribe/razorpay/confirm',
  authenticate,
  confirmRazorpayValidator, validate,
  billingController.confirmRazorpayPayment
);

router.post('/checkout/stripe',
  authenticate, billingLimiter,
  checkoutValidator, validate,
  billingController.createStripeCheckout
);

router.get('/portal',    authenticate, billingController.getBillingPortal);
router.post('/cancel',   authenticate, billingController.cancelSubscription);

router.put('/tier',
  authenticate,
  changeTierValidator, validate,
  billingController.changeTier
);

router.get('/invoices',       authenticate, billingController.getInvoices);
router.get('/invoices/live',  authenticate, billingController.getLiveInvoices);
router.get('/invoices/:id',   authenticate, billingController.getInvoice);

module.exports = router;
