const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const User = require('../auth/auth.model');
const Profile = require('../users/profile.model');
const Community = require('../communities/community.model');
const Post = require('../posts/post.model');

jest.setTimeout(30000);

jest.mock('../../utils/email', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../config/socket', () => ({
  emitToUser: jest.fn(),
  emitToCommunity: jest.fn(),
  emitToAll: jest.fn(),
  getIO: jest.fn(),
  initializeSocket: jest.fn(),
}));

jest.mock('../../utils/cache', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
  delete: jest.fn().mockResolvedValue(true),
  deletePattern: jest.fn().mockResolvedValue(true),
  isAvailable: jest.fn().mockReturnValue(false),
  keys: {
    communityFeed: (id, page) => `feed:${id}:${page}`,
    community: (slug) => `community:${slug}`,
    communityList: (page) => `communities:${page}`,
    profile: (userId) => `profile:${userId}`,
    post: (postId) => `post:${postId}`,
    notifications: (userId, page) => `notifications:${userId}:${page}`,
    unreadCount: (userId) => `unread:${userId}`,
    search: (query, type) => `search:${type}:${query}`,
    onlineUsers: () => 'online:users',
  },
}));

let token;
let testUser;
let testCommunity;
let testPost;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/circlecore_test');
  await User.deleteMany({});
  await Profile.deleteMany({});
  await Community.deleteMany({});
  await Post.deleteMany({});

  testUser = await User.create({
    name: 'Realtime Test User',
    email: 'realtime@test.com',
    password: 'Test@1234',
    role: 'super_admin',
    isEmailVerified: true,
  });

  const profile = await Profile.create({ userId: testUser._id });
  await User.findByIdAndUpdate(testUser._id, { profileId: profile._id });

  const loginRes = await request(app).post('/api/auth/login').send({
    email: 'realtime@test.com',
    password: 'Test@1234',
  });
  token = loginRes.body.data.accessToken;

  testCommunity = await Community.create({
    name: 'Realtime Community',
    description: 'Community for realtime testing',
    createdBy: testUser._id,
    members: [{ userId: testUser._id, role: 'admin' }],
    memberCount: 1,
  });

  testPost = await Post.create({
    communityId: testCommunity._id,
    authorId: testUser._id,
    content: 'Test post for realtime testing',
    title: 'Realtime Test Post',
  });
}, 30000);

afterAll(async () => {
  await User.deleteMany({});
  await Profile.deleteMany({});
  await Community.deleteMany({});
  await Post.deleteMany({});
  await mongoose.connection.close();
}, 30000);

describe('Cache Integration', () => {
  it('should create post with cache invalidation', async () => {
    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', 'Bearer ' + token)
      .send({
        communityId: testCommunity._id,
        content: 'Post with cache integration',
        title: 'Cache Test Post',
        type: 'text',
      });
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('should get community feed with cache', async () => {
    const res = await request(app)
      .get('/api/posts/community/' + testCommunity._id)
      .set('Authorization', 'Bearer ' + token);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.posts).toBeDefined();
  });

  it('should get communities list with cache', async () => {
    const res = await request(app).get('/api/communities');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.communities).toBeDefined();
  });

  it('should get community by slug with cache', async () => {
    const res = await request(app)
      .get('/api/communities/' + testCommunity.slug);
    expect(res.statusCode).toBe(200);
  });
});

describe('Real-time Socket Events', () => {
  it('should emit new post event when post is created', async () => {
    const { emitToCommunity } = require('../../config/socket');
    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', 'Bearer ' + token)
      .send({
        communityId: testCommunity._id,
        content: 'This post triggers socket event',
        title: 'Socket Test Post',
      });
    expect(res.statusCode).toBe(201);
    expect(emitToCommunity).toHaveBeenCalled();
  });

  it('should emit reaction event on post react', async () => {
    const { emitToCommunity } = require('../../config/socket');
    const res = await request(app)
      .post('/api/posts/' + testPost._id + '/react')
      .set('Authorization', 'Bearer ' + token)
      .send({ type: 'like' });
    expect(res.statusCode).toBe(200);
    expect(emitToCommunity).toHaveBeenCalled();
  });
});

describe('Online Presence', () => {
  it('should get online users', async () => {
    const res = await request(app)
      .get('/api/profiles/online/users')
      .set('Authorization', 'Bearer ' + token);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty('onlineUsers');
    expect(res.body.data).toHaveProperty('count');
  });

  it('should check if user is online', async () => {
    const res = await request(app)
      .get('/api/profiles/online/' + testUser._id)
      .set('Authorization', 'Bearer ' + token);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty('isOnline');
  });
});