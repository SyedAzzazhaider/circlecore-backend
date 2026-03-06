const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const User = require('../auth/auth.model');
const InviteCode = require('../auth/inviteCode.model');
const Profile = require('../users/profile.model');
const Flag = require('./flag.model');
const Warning = require('./warning.model');
const AuditLog = require('./auditLog.model');
const Blocklist = require('./blocklist.model');
const Community = require('../communities/community.model');
const Post = require('../posts/post.model');

/**
 * Moderation Module Tests
 * Document requirement: MODULE H — Moderation & Safety
 */

jest.mock('../../utils/email', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  sendInvoiceEmail: jest.fn().mockResolvedValue(true),
  sendAnnouncementEmail: jest.fn().mockResolvedValue(true),
  sendWeeklyDigest: jest.fn().mockResolvedValue(true),
}));

let memberToken, moderatorToken, adminToken;
let member, moderator, admin, adminUser;
let testCommunity, testPost, testFlag;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/circlecore_test');

  await Promise.all([
    User.deleteMany({ email: /@modtest\.com$/ }),
    Flag.deleteMany({}),
    Warning.deleteMany({}),
    AuditLog.deleteMany({}),
    Blocklist.deleteMany({}),
  ]);

  // Seed admin to create invite codes
  adminUser = await User.create({
    name: 'Mod Seeder',
    email: 'seeder@modtest.com',
    password: 'Admin@1234',
    role: 'super_admin',
    isEmailVerified: true,
  });
  await Profile.create({ userId: adminUser._id });

  // Register member
  const inv1 = await InviteCode.create({ createdBy: adminUser._id });
  await request(app).post('/api/auth/register').send({ name: 'Mod Member', email: 'member@modtest.com', password: 'Password123!', inviteCode: inv1.code });
  member = await User.findOneAndUpdate({ email: 'member@modtest.com' }, { isEmailVerified: true }, { new: true });
  await Profile.findOneAndUpdate({ userId: member._id }, {}, { upsert: true });

  // Register moderator
  const inv2 = await InviteCode.create({ createdBy: adminUser._id });
  await request(app).post('/api/auth/register').send({ name: 'Mod Moderator', email: 'moderator@modtest.com', password: 'Password123!', inviteCode: inv2.code });
  moderator = await User.findOneAndUpdate({ email: 'moderator@modtest.com' }, { isEmailVerified: true, role: 'moderator' }, { new: true });
  await Profile.findOneAndUpdate({ userId: moderator._id }, {}, { upsert: true });

  // Register admin
  const inv3 = await InviteCode.create({ createdBy: adminUser._id });
  await request(app).post('/api/auth/register').send({ name: 'Mod Admin', email: 'admin@modtest.com', password: 'Password123!', inviteCode: inv3.code });
  admin = await User.findOneAndUpdate({ email: 'admin@modtest.com' }, { isEmailVerified: true, role: 'admin' }, { new: true });
  await Profile.findOneAndUpdate({ userId: admin._id }, {}, { upsert: true });

  // Login all three
  const [mLogin, modLogin, adminLogin] = await Promise.all([
    request(app).post('/api/auth/login').send({ email: 'member@modtest.com', password: 'Password123!' }),
    request(app).post('/api/auth/login').send({ email: 'moderator@modtest.com', password: 'Password123!' }),
    request(app).post('/api/auth/login').send({ email: 'admin@modtest.com', password: 'Password123!' }),
  ]);
  memberToken = mLogin.body.data?.accessToken;
  moderatorToken = modLogin.body.data?.accessToken;
  adminToken = adminLogin.body.data?.accessToken;

  // Create test community and post
  testCommunity = await Community.create({
    name: 'Mod Test Community',
    slug: 'mod-test-' + Date.now(),
    description: 'Test',
    createdBy: admin._id,
    members: [member._id, moderator._id, admin._id],
  });
  testPost = await Post.create({
    communityId: testCommunity._id,
    authorId: member._id,
    type: 'text',
    title: 'Test Post for Moderation',
    content: 'Test content',
  });
});

afterAll(async () => {
  await Promise.all([
    User.deleteMany({ email: /@modtest\.com$/ }),
    Flag.deleteMany({}),
    Warning.deleteMany({}),
    AuditLog.deleteMany({}),
    Blocklist.deleteMany({}),
    Community.deleteMany({ name: 'Mod Test Community' }),
    Post.deleteMany({ title: 'Test Post for Moderation' }),
  ]);
  await mongoose.connection.close();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Moderation Module', () => {

  describe('Content Flags', () => {

    it('should allow a member to submit a flag', async () => {
      const res = await request(app)
        .post('/api/moderation/flags')
        .set('Authorization', 'Bearer ' + memberToken)
        .send({ contentType: 'post', contentId: testPost._id, communityId: testCommunity._id, reason: 'spam', description: 'Spam post' });
      expect(res.statusCode).toBe(201);
      expect(res.body.data.flag.status).toBe('pending');
      testFlag = res.body.data.flag;
    });

    it('should reject duplicate flag from same user', async () => {
      const res = await request(app)
        .post('/api/moderation/flags')
        .set('Authorization', 'Bearer ' + memberToken)
        .send({ contentType: 'post', contentId: testPost._id, reason: 'spam' });
      expect(res.statusCode).toBe(409);
    });

    it('should reject flag without authentication', async () => {
      const res = await request(app)
        .post('/api/moderation/flags')
        .send({ contentType: 'post', contentId: testPost._id, reason: 'spam' });
      expect(res.statusCode).toBe(401);
    });

    it('should allow moderator to view review queue', async () => {
      const res = await request(app).get('/api/moderation/flags').set('Authorization', 'Bearer ' + moderatorToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.flags).toBeDefined();
      expect(res.body.data.pagination).toBeDefined();
    });

    it('should reject review queue access for regular member', async () => {
      const res = await request(app).get('/api/moderation/flags').set('Authorization', 'Bearer ' + memberToken);
      expect(res.statusCode).toBe(403);
    });

    it('should allow moderator to review a flag', async () => {
      const res = await request(app)
        .patch(`/api/moderation/flags/${testFlag._id}/review`)
        .set('Authorization', 'Bearer ' + moderatorToken)
        .send({ status: 'resolved', resolution: 'content_removed', resolutionNote: 'Confirmed spam' });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.flag.status).toBe('resolved');
    });
  });

  describe('Member Warnings', () => {

    it('should allow moderator to issue a warning', async () => {
      const res = await request(app)
        .post('/api/moderation/warnings')
        .set('Authorization', 'Bearer ' + moderatorToken)
        .send({ userId: member._id, reason: 'Spam posting', severity: 'minor', communityId: testCommunity._id });
      expect(res.statusCode).toBe(201);
      expect(res.body.data.warning.severity).toBe('minor');
    });

    it('should reject warning issuance by regular member', async () => {
      const res = await request(app)
        .post('/api/moderation/warnings')
        .set('Authorization', 'Bearer ' + memberToken)
        .send({ userId: member._id, reason: 'Test', severity: 'minor' });
      expect(res.statusCode).toBe(403);
    });

    it('should allow moderator to view user warnings', async () => {
      const res = await request(app).get(`/api/moderation/warnings/${member._id}`).set('Authorization', 'Bearer ' + moderatorToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Temporary Suspensions', () => {

    let suspendTarget;

    beforeAll(async () => {
      const inv = await InviteCode.create({ createdBy: adminUser._id });
      await request(app).post('/api/auth/register').send({ name: 'Suspend Target', email: 'suspend@modtest.com', password: 'Password123!', inviteCode: inv.code });
      suspendTarget = await User.findOneAndUpdate({ email: 'suspend@modtest.com' }, { isEmailVerified: true }, { new: true });
      await Profile.findOneAndUpdate({ userId: suspendTarget._id }, {}, { upsert: true });
    });

    it('should allow moderator to suspend a user temporarily', async () => {
      const suspendedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const res = await request(app)
        .post('/api/moderation/suspend')
        .set('Authorization', 'Bearer ' + moderatorToken)
        .send({ userId: suspendTarget._id, reason: 'Repeated violations', suspendedUntil });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.suspended).toBe(true);
    });

    it('should allow moderator to unsuspend a user', async () => {
      const res = await request(app)
        .post('/api/moderation/unsuspend')
        .set('Authorization', 'Bearer ' + moderatorToken)
        .send({ userId: suspendTarget._id });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.suspended).toBe(false);
    });
  });

  describe('Blocklist', () => {

    let banTarget;

    beforeAll(async () => {
      const inv = await InviteCode.create({ createdBy: adminUser._id });
      await request(app).post('/api/auth/register').send({ name: 'Ban Target', email: 'bantarget@modtest.com', password: 'Password123!', inviteCode: inv.code });
      banTarget = await User.findOneAndUpdate({ email: 'bantarget@modtest.com' }, { isEmailVerified: true }, { new: true });
      await Profile.findOneAndUpdate({ userId: banTarget._id }, {}, { upsert: true });
    });

    it('should allow moderator to ban a user from a community', async () => {
      const res = await request(app)
        .post('/api/moderation/ban')
        .set('Authorization', 'Bearer ' + moderatorToken)
        .send({ userId: banTarget._id, communityId: testCommunity._id, reason: 'Repeated spam' });
      expect(res.statusCode).toBe(201);
      expect(res.body.data.ban.type).toBe('community_ban');
    });

    it('should allow moderator to unban a user', async () => {
      const res = await request(app)
        .post('/api/moderation/unban')
        .set('Authorization', 'Bearer ' + moderatorToken)
        .send({ userId: banTarget._id, communityId: testCommunity._id });
      expect(res.statusCode).toBe(200);
      expect(res.body.data.unbanned).toBe(true);
    });

    it('should allow a user to block another user', async () => {
      const res = await request(app)
        .post('/api/moderation/block')
        .set('Authorization', 'Bearer ' + memberToken)
        .send({ userId: moderator._id });
      expect(res.statusCode).toBe(201);
    });

    it('should allow a user to unblock another user', async () => {
      const res = await request(app)
        .post('/api/moderation/unblock')
        .set('Authorization', 'Bearer ' + memberToken)
        .send({ userId: moderator._id });
      expect(res.statusCode).toBe(200);
    });

    it('should return user blocked list', async () => {
      const res = await request(app).get('/api/moderation/blocked').set('Authorization', 'Bearer ' + memberToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.blocks).toBeDefined();
    });
  });

  describe('Audit Logs', () => {

    it('should allow moderator to view audit logs', async () => {
      const res = await request(app).get('/api/moderation/audit').set('Authorization', 'Bearer ' + moderatorToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.logs).toBeDefined();
      expect(res.body.data.logs.length).toBeGreaterThan(0);
    });

    it('should allow moderator to view moderation stats', async () => {
      const res = await request(app).get('/api/moderation/stats').set('Authorization', 'Bearer ' + moderatorToken);
      expect(res.statusCode).toBe(200);
      expect(res.body.data.stats).toHaveProperty('pendingFlags');
      expect(res.body.data.stats).toHaveProperty('activeWarnings');
      expect(res.body.data.stats).toHaveProperty('activeBans');
    });

    it('should reject audit log access for regular member', async () => {
      const res = await request(app).get('/api/moderation/audit').set('Authorization', 'Bearer ' + memberToken);
      expect(res.statusCode).toBe(403);
    });
  });
});