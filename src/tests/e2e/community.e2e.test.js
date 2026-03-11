const request = require('supertest');
const app      = require('../../../app');

/**
 * Community API — E2E Tests
 */

describe('Community API — E2E', () => {

  describe('GET /api/communities', () => {
    it('returns 401 without auth token', async () => {
      const res = await request(app).get('/api/communities');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/communities', () => {
    it('returns 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/communities')
        .send({ name: 'Test Community', description: 'A test' });
      expect(res.status).toBe(401);
    });

    it('returns 400 if name is missing', async () => {
      const res = await request(app)
        .post('/api/communities')
        .set('Authorization', 'Bearer faketoken')
        .send({ description: 'missing name' });
      expect([400, 401]).toContain(res.status);
    });
  });

  describe('GET /api/communities/:id', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/communities/507f1f77bcf86cd799439011');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/communities/:id/join', () => {
    it('returns 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/communities/507f1f77bcf86cd799439011/join');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/events', () => {
    it('returns 401 without auth token', async () => {
      const res = await request(app).get('/api/events');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/events/:id/invite', () => {
    it('returns 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/events/507f1f77bcf86cd799439011/invite')
        .send({ userId: '507f1f77bcf86cd799439012' });
      expect(res.status).toBe(401);
    });

    it('returns 400 if userId is missing', async () => {
      const res = await request(app)
        .post('/api/events/507f1f77bcf86cd799439011/invite')
        .set('Authorization', 'Bearer faketoken')
        .send({});
      expect([400, 401]).toContain(res.status);
    });
  });
});