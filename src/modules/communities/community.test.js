const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const User = require('../auth/auth.model');
const Profile = require('../users/profile.model');
const Community = require('./community.model');
const Post = require('../posts/post.model');

jest.setTimeout(30000);

jest.mock('../../utils/email', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
}));

let adminToken;
let adminUser;
let testCommunity;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/circlecore_test');
  await User.deleteMany({});
  await Profile.deleteMany({});
  await Community.deleteMany({});
  await Post.deleteMany({});

  adminUser = await User.create({
    name: 'Admin User',
    email: 'admin@test.com',
    password: 'Admin@1234',
    role: 'super_admin',
    isEmailVerified: true,
  });

  const profile = await Profile.create({ userId: adminUser._id });
  await User.findByIdAndUpdate(adminUser._id, { profileId: profile._id });

  const res = await request(app).post('/api/auth/login').send({
    email: 'admin@test.com',
    password: 'Admin@1234',
  });

  adminToken = res.body.data.accessToken;
}, 30000);

afterAll(async () => {
  await User.deleteMany({});
  await Profile.deleteMany({});
  await Community.deleteMany({});
  await Post.deleteMany({});
  await mongoose.connection.close();
}, 30000);

describe('Profile Module', () => {

  it('should get my profile', async () => {
    const res = await request(app)
      .get('/api/profiles/me')
      .set('Authorization', 'Bearer ' + adminToken);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should update my profile', async () => {
    const res = await request(app)
      .put('/api/profiles/me')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({
        bio: 'I am the admin of CircleCore',
        skills: ['Node.js', 'MongoDB'],
      });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.profile.bio).toBe('I am the admin of CircleCore');
  });

});

describe('Community Module', () => {

  it('should create a community', async () => {
    const res = await request(app)
      .post('/api/communities')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({
        name: 'Test Community',
        description: 'A test community for CircleCore',
        category: 'technology',
        tags: ['test', 'circlecore'],
      });
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    testCommunity = res.body.data.community;
  });

  it('should get all communities', async () => {
    const res = await request(app).get('/api/communities');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.communities).toBeDefined();
  });

  it('should get community by slug', async () => {
    const res = await request(app)
      .get('/api/communities/' + testCommunity.slug);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.community.name).toBe('Test Community');
  });

  it('should get my communities', async () => {
    const res = await request(app)
      .get('/api/communities/my')
      .set('Authorization', 'Bearer ' + adminToken);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.communities.length).toBeGreaterThan(0);
  });

  it('should reject community without name', async () => {
    const res = await request(app)
      .post('/api/communities')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ description: 'No name provided' });
    expect(res.statusCode).toBe(422);
  });

});

describe('Posts Module', () => {

  it('should create a post', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({
        communityId: testCommunity._id,
        content: 'This is a test post in CircleCore',
        title: 'Test Post',
        type: 'text',
        tags: ['test'],
      });
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('should get community feed', async () => {
    const res = await request(app)
      .get('/api/posts/community/' + testCommunity._id)
      .set('Authorization', 'Bearer ' + adminToken);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.posts).toBeDefined();
  });

  it('should reject post without content', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ communityId: testCommunity._id });
    expect(res.statusCode).toBe(422);
  });

  it('should reject post without auth', async () => {
    const res = await request(app)
      .post('/api/posts')
      .send({
        communityId: testCommunity._id,
        content: 'Unauthorized post attempt',
      });
    expect(res.statusCode).toBe(401);
  });
  
});