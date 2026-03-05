const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../app');
const User = require('../auth/auth.model');
const Profile = require('../users/profile.model');
const Community = require('../communities/community.model');
const Post = require('../posts/post.model');
const Comment = require('./comment.model');
const Event = require('../events/event.model');
const Notification = require('../notifications/notification.model');

jest.setTimeout(30000);

jest.mock('../../utils/email', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(true),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
}));

let token;
let testUser;
let testCommunity;
let testPost;
let testComment;
let testEvent;

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/circlecore_test');
  await User.deleteMany({});
  await Profile.deleteMany({});
  await Community.deleteMany({});
  await Post.deleteMany({});
  await Comment.deleteMany({});
  await Event.deleteMany({});
  await Notification.deleteMany({});

  testUser = await User.create({
    name: 'Test User',
    email: 'testuser@test.com',
    password: 'Test@1234',
    role: 'super_admin',
    isEmailVerified: true,
  });
  const profile = await Profile.create({ userId: testUser._id });
  await User.findByIdAndUpdate(testUser._id, { profileId: profile._id });

  const loginRes = await request(app).post('/api/auth/login').send({
    email: 'testuser@test.com',
    password: 'Test@1234',
  });
  token = loginRes.body.data.accessToken;

  testCommunity = await Community.create({
    name: 'Test Community',
    description: 'Test community description',
    createdBy: testUser._id,
    members: [{ userId: testUser._id, role: 'admin' }],
    memberCount: 1,
  });

  testPost = await Post.create({
    communityId: testCommunity._id,
    authorId: testUser._id,
    content: 'Test post content',
    title: 'Test Post',
  });
}, 30000);

afterAll(async () => {
  await User.deleteMany({});
  await Profile.deleteMany({});
  await Community.deleteMany({});
  await Post.deleteMany({});
  await Comment.deleteMany({});
  await Event.deleteMany({});
  await Notification.deleteMany({});
  await mongoose.connection.close();
}, 30000);

describe('Comments Module', () => {
  it('should create a comment', async () => {
    const res = await request(app)
      .post('/api/comments')
      .set('Authorization', 'Bearer ' + token)
      .send({ postId: testPost._id, content: 'This is a test comment' });
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    testComment = res.body.data.comment;
  });

  it('should get post comments', async () => {
    const res = await request(app)
      .get('/api/comments/post/' + testPost._id)
      .set('Authorization', 'Bearer ' + token);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.comments).toBeDefined();
  });

  it('should create a reply to comment', async () => {
    const res = await request(app)
      .post('/api/comments')
      .set('Authorization', 'Bearer ' + token)
      .send({ postId: testPost._id, content: 'This is a reply', parentId: testComment._id });
    expect(res.statusCode).toBe(201);
  });

  it('should get comment replies', async () => {
    const res = await request(app)
      .get('/api/comments/' + testComment._id + '/replies')
      .set('Authorization', 'Bearer ' + token);
    expect(res.statusCode).toBe(200);
  });

  it('should react to comment', async () => {
    const res = await request(app)
      .post('/api/comments/' + testComment._id + '/react')
      .set('Authorization', 'Bearer ' + token)
      .send({ type: 'like' });
    expect(res.statusCode).toBe(200);
  });

  it('should update comment', async () => {
    const res = await request(app)
      .put('/api/comments/' + testComment._id)
      .set('Authorization', 'Bearer ' + token)
      .send({ content: 'Updated comment content' });
    expect(res.statusCode).toBe(200);
  });

  it('should reject comment without content', async () => {
    const res = await request(app)
      .post('/api/comments')
      .set('Authorization', 'Bearer ' + token)
      .send({ postId: testPost._id });
    expect(res.statusCode).toBe(422);
  });
});

describe('Notifications Module', () => {
  it('should get my notifications', async () => {
    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', 'Bearer ' + token);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.notifications).toBeDefined();
  });

  it('should get unread count', async () => {
    const res = await request(app)
      .get('/api/notifications/unread-count')
      .set('Authorization', 'Bearer ' + token);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.unreadCount).toBeDefined();
  });

  it('should mark all as read', async () => {
    const res = await request(app)
      .patch('/api/notifications/mark-all-read')
      .set('Authorization', 'Bearer ' + token);
    expect(res.statusCode).toBe(200);
  });
});

describe('Events Module', () => {
  it('should create an event', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', 'Bearer ' + token)
      .send({
        communityId: testCommunity._id,
        title: 'CircleCore Launch Event',
        description: 'Our first community event on CircleCore platform',
        type: 'online',
        startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(),
      });
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    testEvent = res.body.data.event;
  });

  it('should get community events', async () => {
    const res = await request(app)
      .get('/api/events/community/' + testCommunity._id)
      .set('Authorization', 'Bearer ' + token);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.events).toBeDefined();
  });

  it('should RSVP to event', async () => {
    const res = await request(app)
      .post('/api/events/' + testEvent._id + '/rsvp')
      .set('Authorization', 'Bearer ' + token)
      .send({ status: 'going' });
    expect(res.statusCode).toBe(200);
  });

  it('should get my RSVPs', async () => {
    const res = await request(app)
      .get('/api/events/my-rsvps')
      .set('Authorization', 'Bearer ' + token);
    expect(res.statusCode).toBe(200);
  });

  it('should reject event without title', async () => {
    const res = await request(app)
      .post('/api/events')
      .set('Authorization', 'Bearer ' + token)
      .send({
        communityId: testCommunity._id,
        description: 'No title provided',
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
      });
    expect(res.statusCode).toBe(422);
  });
});

describe('Search Module', () => {
  it('should perform global search', async () => {
    const res = await request(app)
      .get('/api/search?q=test')
      .set('Authorization', 'Bearer ' + token);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.results).toBeDefined();
  });

  it('should search communities', async () => {
    const res = await request(app)
      .get('/api/search/communities?q=test')
      .set('Authorization', 'Bearer ' + token);
    expect(res.statusCode).toBe(200);
  });

  it('should search posts', async () => {
    const res = await request(app)
      .get('/api/search/posts?q=test')
      .set('Authorization', 'Bearer ' + token);
    expect(res.statusCode).toBe(200);
  });

  it('should reject empty search', async () => {
    const res = await request(app)
      .get('/api/search')
      .set('Authorization', 'Bearer ' + token);
    expect(res.statusCode).toBe(400);
  });
});