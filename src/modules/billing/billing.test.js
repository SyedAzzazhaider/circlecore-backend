const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const User = require('../auth/auth.model');
const Profile = require('../users/profile.model');
const InviteCode = require('../auth/inviteCode.model');
const Subscription = require('./subscription.model');
const Invoice = require('./invoice.model');

/**
 * Module G — Tiered Membership & Billing Tests
 * Tests all billing flows without real Stripe/Razorpay calls
 * External payment SDKs are mocked
 */

// Mock Stripe — prevents real API calls in tests
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    customers: {
      create: jest.fn().mockResolvedValue({ id: 'cus_test_123', email: 'test@test.com' }),
      update: jest.fn().mockResolvedValue({ id: 'cus_test_123' }),
      createTaxId: jest.fn().mockResolvedValue({ id: 'txi_test_123' }),
    },
    subscriptions: {
      create: jest.fn().mockResolvedValue({
        id: 'sub_test_123',
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 2592000,
        cancel_at_period_end: false,
        latest_invoice: {
          payment_intent: { id: 'pi_test_123', status: 'succeeded' },
        },
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'sub_test_123',
        status: 'active',
        items: { data: [{ id: 'si_test_123' }] },
        cancel_at_period_end: false,
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 2592000,
      }),
      update: jest.fn().mockResolvedValue({
        id: 'sub_test_123',
        status: 'active',
        cancel_at_period_end: true,
        current_period_end: Math.floor(Date.now() / 1000) + 2592000,
      }),
      cancel: jest.fn().mockResolvedValue({
        id: 'sub_test_123',
        status: 'canceled',
      }),
    },
    paymentMethods: {
      attach: jest.fn().mockResolvedValue({ id: 'pm_test_123' }),
    },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          id: 'cs_test_123',
          url: 'https://checkout.stripe.com/test',
        }),
      },
    },
    billingPortal: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          url: 'https://billing.stripe.com/test',
        }),
      },
    },
    invoices: {
      list: jest.fn().mockResolvedValue({ data: [] }),
      retrieve: jest.fn().mockResolvedValue({ id: 'in_test_123', status: 'paid' }),
    },
    webhooks: {
      constructEvent: jest.fn().mockReturnValue({
        type: 'invoice.payment_succeeded',
        data: { object: { id: 'in_test_123', subscription: 'sub_test_123', status: 'paid', total: 999, subtotal: 999, tax: 0, currency: 'usd', period_start: Math.floor(Date.now() / 1000), period_end: Math.floor(Date.now() / 1000) + 2592000, lines: { data: [] } } },
      }),
    },
  }));
});

// Mock email sending
jest.mock('../../utils/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  sendNotificationDigest: jest.fn().mockResolvedValue(true),
  sendAnnouncementEmail: jest.fn().mockResolvedValue(true),
}));

let memberToken;
let memberUser;
let adminToken;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/circlecore_test');
  await User.deleteMany({ email: { $in: ['billing_member@test.com', 'billing_admin@test.com'] } });
  await Subscription.deleteMany({});
  await Invoice.deleteMany({});
  await Profile.deleteMany({ bio: 'billing test' });

  // Create admin
  const adminUser = await User.create({
    name: 'Billing Admin',
    email: 'billing_admin@test.com',
    password: 'Admin@1234',
    role: 'super_admin',
    isEmailVerified: true,
  });
  await Profile.create({ userId: adminUser._id, bio: 'billing test' });

  // Create member
  memberUser = await User.create({
    name: 'Billing Member',
    email: 'billing_member@test.com',
    password: 'Member@1234',
    role: 'member',
    isEmailVerified: true,
  });
  await Profile.create({ userId: memberUser._id, bio: 'billing test' });

  // Login both
  const adminRes = await request(app).post('/api/auth/login').send({
    email: 'billing_admin@test.com',
    password: 'Admin@1234',
  });
  adminToken = adminRes.body.data?.accessToken;

  const memberRes = await request(app).post('/api/auth/login').send({
    email: 'billing_member@test.com',
    password: 'Member@1234',
  });
  memberToken = memberRes.body.data?.accessToken;
});

afterAll(async () => {
  await User.deleteMany({ email: { $in: ['billing_member@test.com', 'billing_admin@test.com'] } });
  await Subscription.deleteMany({});
  await Invoice.deleteMany({});
  await Profile.deleteMany({ bio: 'billing test' });
  await mongoose.connection.close();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Billing — Plans', () => {

  it('GET /api/billing/plans — returns all 3 plans publicly', async () => {
    const res = await request(app).get('/api/billing/plans');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.plans).toHaveLength(3);

    const tiers = res.body.data.plans.map(p => p.tier);
    expect(tiers).toContain('free');
    expect(tiers).toContain('premium');
    expect(tiers).toContain('enterprise');
  });

  it('GET /api/billing/plans — free plan has zero price', async () => {
    const res = await request(app).get('/api/billing/plans');
    const freePlan = res.body.data.plans.find(p => p.tier === 'free');
    expect(freePlan.price.monthly).toBe(0);
    expect(freePlan.price.annual).toBe(0);
  });

  it('GET /api/billing/plans — premium plan has features array', async () => {
    const res = await request(app).get('/api/billing/plans');
    const premiumPlan = res.body.data.plans.find(p => p.tier === 'premium');
    expect(Array.isArray(premiumPlan.features)).toBe(true);
    expect(premiumPlan.features.length).toBeGreaterThan(0);
  });

  it('GET /api/billing/plans — enterprise plan has analytics feature', async () => {
    const res = await request(app).get('/api/billing/plans');
    const enterprise = res.body.data.plans.find(p => p.tier === 'enterprise');
    const hasAnalytics = enterprise.features.some(f => f.toLowerCase().includes('analytic'));
    expect(hasAnalytics).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Billing — Subscription Management', () => {

  it('GET /api/billing/subscription — requires auth', async () => {
    const res = await request(app).get('/api/billing/subscription');
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/billing/subscription — returns free tier for new user', async () => {
    const res = await request(app)
      .get('/api/billing/subscription')
      .set('Authorization', 'Bearer ' + memberToken);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.subscription.tier).toBe('free');
    expect(res.body.data.subscription.status).toBe('active');
  });

  it('POST /api/billing/subscribe/stripe — requires auth', async () => {
    const res = await request(app).post('/api/billing/subscribe/stripe').send({
      tier: 'premium',
      paymentMethodId: 'pm_test_123',
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/billing/subscribe/stripe — rejects free tier', async () => {
    const res = await request(app)
      .post('/api/billing/subscribe/stripe')
      .set('Authorization', 'Bearer ' + memberToken)
      .send({ tier: 'free', paymentMethodId: 'pm_test_123' });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/billing/subscribe/stripe — rejects without paymentMethodId', async () => {
    const res = await request(app)
      .post('/api/billing/subscribe/stripe')
      .set('Authorization', 'Bearer ' + memberToken)
      .send({ tier: 'premium' });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/billing/subscribe/stripe — successfully subscribes to premium', async () => {
    // Set Stripe env key for this test
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
    process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID = 'price_premium_monthly_test';

    const res = await request(app)
      .post('/api/billing/subscribe/stripe')
      .set('Authorization', 'Bearer ' + memberToken)
      .send({
        tier: 'premium',
        interval: 'monthly',
        paymentMethodId: 'pm_test_123',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.data.subscription.tier).toBe('premium');
  });

  it('GET /api/billing/subscription — shows premium after subscription', async () => {
    const res = await request(app)
      .get('/api/billing/subscription')
      .set('Authorization', 'Bearer ' + memberToken);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.subscription.tier).toBe('premium');
    expect(res.body.data.subscription.status).toBe('active');
  });

  it('POST /api/billing/checkout/stripe — returns checkout URL', async () => {
    const res = await request(app)
      .post('/api/billing/checkout/stripe')
      .set('Authorization', 'Bearer ' + memberToken)
      .send({ tier: 'premium', interval: 'monthly' });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.checkoutUrl).toBeDefined();
    expect(res.body.data.sessionId).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Billing — Razorpay', () => {

  it('POST /api/billing/subscribe/razorpay — rejects without tier', async () => {
    const res = await request(app)
      .post('/api/billing/subscribe/razorpay')
      .set('Authorization', 'Bearer ' + memberToken)
      .send({});
    expect(res.statusCode).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Billing — Cancellation', () => {

  it('POST /api/billing/cancel — requires auth', async () => {
    const res = await request(app).post('/api/billing/cancel');
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/billing/cancel — cancels at period end by default', async () => {
    const res = await request(app)
      .post('/api/billing/cancel')
      .set('Authorization', 'Bearer ' + memberToken)
      .send({ immediately: false });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.subscription.cancelAtPeriodEnd).toBe(true);
    expect(res.body.data.subscription.autoRenew).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Billing — Invoices', () => {

  it('GET /api/billing/invoices — requires auth', async () => {
    const res = await request(app).get('/api/billing/invoices');
    expect(res.statusCode).toBe(401);
  });

  it('GET /api/billing/invoices — returns paginated invoice list', async () => {
    const res = await request(app)
      .get('/api/billing/invoices')
      .set('Authorization', 'Bearer ' + memberToken);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.invoices).toBeDefined();
    expect(res.body.data.pagination).toBeDefined();
  });

  it('GET /api/billing/invoices/:id — returns 404 for invalid invoice', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get('/api/billing/invoices/' + fakeId)
      .set('Authorization', 'Bearer ' + memberToken);
    expect(res.statusCode).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Billing — Webhook Security', () => {

  it('POST /api/billing/webhook/stripe — rejects missing signature', async () => {
    const res = await request(app)
      .post('/api/billing/webhook/stripe')
      .send('{}');
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/billing/webhook/razorpay — rejects missing signature', async () => {
    const res = await request(app)
      .post('/api/billing/webhook/razorpay')
      .send({});
    expect(res.statusCode).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Billing — Subscription Model', () => {

  it('Subscription model — creates with correct defaults', async () => {
    const user = await User.findOne({ email: 'billing_member@test.com' });
    const sub = await Subscription.findOne({ userId: user._id });
    expect(sub).toBeDefined();
    expect(sub.autoRenew).toBeDefined();
    expect(['free', 'premium', 'enterprise']).toContain(sub.tier);
  });

  it('Invoice model — generates invoice number on create', async () => {
    const user = await User.findOne({ email: 'billing_member@test.com' });
    const sub = await Subscription.findOne({ userId: user._id });

    if (sub) {
      const invoice = await Invoice.create({
        userId: user._id,
        subscriptionId: sub._id,
        provider: 'stripe',
        providerInvoiceId: 'in_test_' + Date.now(),
        status: 'paid',
        currency: 'usd',
        subtotal: 999,
        taxAmount: 0,
        total: 999,
        tier: 'premium',
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        lineItems: [{ description: 'CircleCore Premium', quantity: 1, unitAmount: 999, amount: 999 }],
      });

      expect(invoice.invoiceNumber).toBeDefined();
      expect(invoice.invoiceNumber).toMatch(/^CC-/);
    }
  });
});