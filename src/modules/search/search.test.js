const searchService = require('./search.service');
const Post          = require('../posts/post.model');
const Community     = require('../communities/community.model');
const User          = require('../auth/auth.model');

jest.mock('../posts/post.model');
jest.mock('../communities/community.model');
jest.mock('../auth/auth.model');

beforeEach(() => jest.clearAllMocks());

const makeFindMock = (results) => ({
  select: jest.fn().mockReturnThis(),
  limit:  jest.fn().mockResolvedValue(results),
});

describe('SearchService.search()', () => {
  it('throws 400 if query is empty', async () => {
    await expect(searchService.search({ query: '' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 if query is too short', async () => {
    await expect(searchService.search({ query: 'a' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('returns results across posts, communities, users', async () => {
    Post.find.mockReturnValue(makeFindMock([{ _id: 'p1', content: 'test post' }]));
    Community.find.mockReturnValue(makeFindMock([{ _id: 'c1', name: 'test community' }]));
    User.find.mockReturnValue(makeFindMock([{ _id: 'u1', name: 'test user' }]));

    const result = await searchService.search({ query: 'test' });
    expect(result).toHaveProperty('posts');
    expect(result).toHaveProperty('communities');
    expect(result).toHaveProperty('users');
  });
});