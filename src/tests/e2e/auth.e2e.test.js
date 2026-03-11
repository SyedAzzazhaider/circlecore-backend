const request = require('supertest');
const mongoose = require('mongoose');
const app      = require('../../../app');

/**
 * Auth E2E Tests
 * Tests the full HTTP request → middleware → controller → service → DB flow.
 * Uses a real test MongoDB connection — no mocks.
 */

describe('Auth API — E2E', () => {

  describe('POST /api/auth/login', () => {
    it('returns 400 if email is missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: 'password123' });
      expect(res.status).toBe(400);
    });

    it('returns 400 if password is missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com' });
      expect(res.status).toBe(400);
    });

    it('returns 401 for non-existent user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@nowhere.com', password: 'WrongPass@123' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/register', () => {
    it('returns 400 if invite code is missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Test', email: 'test@test.com', password: 'Pass@12345' });
      expect(res.status).toBe(400);
    });

    it('returns 400 if email is invalid format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Test', email: 'not-an-email', password: 'Pass@12345', inviteCode: 'ABC123' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid invite code', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name:       'Test User',
          email:      'newuser@test.com',
          password:   'StrongPass@123',
          inviteCode: 'INVALID000',
        });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('returns 200 even for non-existent email (prevents enumeration)', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nobody@nowhere.com' });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns 401 with invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalidtoken');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('returns 401 with no refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({});
      expect(res.status).toBe(401);
    });
  });
});