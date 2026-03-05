const express = require('express');
const router = express.Router();
const billingController = require('./billing.controller');
const { authenticate } = require('../../middleware/authenticate');
const { billingLimiter } = require('../../middleware/rateLimiter');

/**
 * Billing Routes
 * Document requirement: MODULE G — Tiered Membership & Billing
 *
 * Base path: /api/billing
 *
 * WEBHOOK RAW BODY:
 * Stripe requires the raw request body (not parsed JSON) to verify webhook signatures.
 * We use express.raw({ type: '*\/*' }) directly on the Stripe webhook route.
 * This is reliable in all environments including Jest/supertest — unlike custom
 * stream listeners (req.on('data') / req.on('end')) which hang in test environments
 * because supertest delivers the body differently from real HTTP connections.
 * req.body will be a Buffer when express.raw() is used — the controller reads it directly.
 */

// ─── Public Routes ────────────────────────────────────────────────────────────

// GET /api/billing/plans — public, no auth required
router.get('/plans', billingController.getPlans);

// ─── Webhook Routes ───────────────────────────────────────────────────────────
// No authenticate — webhooks are called by Stripe/Razorpay servers, not users.
// Signature verification inside the controller replaces auth.

// POST /api/billing/webhook/stripe
// express.raw() delivers req.body as Buffer — required for Stripe HMAC verification.
router.post(
  '/webhook/stripe',
  express.raw({ type: '*/*' }),
  billingController.stripeWebhook
);

// POST /api/billing/webhook/razorpay
router.post('/webhook/razorpay', billingController.razorpayWebhook);

// ─── Protected Routes (require authentication) ────────────────────────────────

// GET /api/billing/subscription
router.get('/subscription', authenticate, billingController.getSubscription);

// POST /api/billing/subscribe/stripe
router.post('/subscribe/stripe', authenticate, billingLimiter, billingController.subscribeWithStripe);

// POST /api/billing/subscribe/razorpay
router.post('/subscribe/razorpay', authenticate, billingLimiter, billingController.subscribeWithRazorpay);

// POST /api/billing/subscribe/razorpay/confirm
router.post('/subscribe/razorpay/confirm', authenticate, billingController.confirmRazorpayPayment);

// POST /api/billing/checkout/stripe — Stripe Checkout hosted page
router.post('/checkout/stripe', authenticate, billingLimiter, billingController.createStripeCheckout);

// GET /api/billing/portal — Stripe Billing Portal
router.get('/portal', authenticate, billingController.getBillingPortal);

// POST /api/billing/cancel
router.post('/cancel', authenticate, billingController.cancelSubscription);

// PUT /api/billing/tier
router.put('/tier', authenticate, billingController.changeTier);

// GET /api/billing/invoices
router.get('/invoices', authenticate, billingController.getInvoices);

// GET /api/billing/invoices/live
router.get('/invoices/live', authenticate, billingController.getLiveInvoices);

// GET /api/billing/invoices/:id
router.get('/invoices/:id', authenticate, billingController.getInvoice);

module.exports = router;