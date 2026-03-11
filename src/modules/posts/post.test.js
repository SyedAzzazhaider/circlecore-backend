const postService = require('./post.service');
const Post        = require('./post.model');
const Community   = require('../communities/community.model');

jest.mock('./post.model');
jest.mock('../communities/community.model');

const mockCommunity = {
  _id:      'comm1',
  isMember: jest.fn().mockReturnValue(true),
};

const mockPost = {
  _id:         'post1',
  content:     'Hello world',
  authorId:    'user1',
  communityId: 'comm1',
  isActive:    true,
  likeCount:   0,
  likes:       [],
  save:        jest.fn().mockResolvedValue(true),
};

beforeEach(() => jest.clearAllMocks());

describe('PostService.createPost()', () => {
  it('throws 403 if user is not a community member', async () => {
    Community.findById.mockResolvedValue({
      ...mockCommunity,
      isMember: jest.fn().mockReturnValue(false),
    });
    await expect(postService.createPost({
      authorId: 'user1', communityId: 'comm1', content: 'test',
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 404 if community not found', async () => {
    Community.findById.mockResolvedValue(null);
    await expect(postService.createPost({
      authorId: 'user1', communityId: 'comm1', content: 'test',
    })).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('PostService.getFeed()', () => {
  it('returns paginated feed', async () => {
    Post.countDocuments.mockResolvedValue(5);
    Post.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort:     jest.fn().mockReturnThis(),
      skip:     jest.fn().mockReturnThis(),
      limit:    jest.fn().mockResolvedValue([mockPost]),
    });
    const result = await postService.getFeed('user1', { page: 1, limit: 10 });
    expect(result.posts).toBeDefined();
  });
});

describe('PostService.getPostById()', () => {
  it('throws 404 if post not found', async () => {
    Post.findById.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      then:     undefined,
    });
    Post.findById.mockResolvedValue(null);
    await expect(postService.getPostById('nonexistent'))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});