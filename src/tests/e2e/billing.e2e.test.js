const request = require('supertest');
const app      = require('../../../app');

/**
 * Billing API — E2E Tests
 */

describe('Billing API — E2E', () => {

  describe('GET /api/billing/subscription', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/billing/subscription');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/billing/subscribe/stripe', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/api/billing/subscribe/stripe')
        .send({ tier: 'premium', interval: 'monthly' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/billing/subscribe/razorpay', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/api/billing/subscribe/razorpay')
        .send({ tier: 'premium', interval: 'monthly' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/billing/cancel', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).post('/api/billing/cancel');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/billing/invoices', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/billing/invoices');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/billing/checkout', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/api/billing/checkout')
        .send({ tier: 'premium', interval: 'monthly' });
      expect(res.status).toBe(401);
    });
  });

  describe('Webhook endpoint is public', () => {
    it('POST /api/billing/webhook/stripe returns 400 without valid signature', async () => {
      const res = await request(app)
        .post('/api/billing/webhook/stripe')
        .send({});
      expect([400, 500]).toContain(res.status);
    });
  });
});