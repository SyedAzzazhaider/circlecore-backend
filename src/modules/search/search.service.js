const User = require('../auth/auth.model');
const Community = require('../communities/community.model');
const Post = require('../posts/post.model');
const Event = require('../events/event.model');
// Escape special regex characters from user input to prevent ReDoS attacks
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class SearchService {

  async globalSearch(query, { page = 1, limit = 10 }) {
    if (!query || query.trim().length < 2) {
      throw Object.assign(new Error('Search query must be at least 2 characters'), { statusCode: 400 });
    }
    
    const searchRegex = new RegExp(escapeRegex(query.trim()), 'i');
    const skip = (page - 1) * limit;

    const [users, communities, posts, events] = await Promise.all([
      User.find({
        $or: [{ name: searchRegex }, { email: searchRegex }],
        isEmailVerified: true,
      }).select('name role createdAt').limit(5),

      Community.find({
        $or: [{ name: searchRegex }, { description: searchRegex }, { tags: searchRegex }],
        isActive: true,
      }).select('name slug description memberCount category').limit(5),

      Post.find({
        $or: [{ title: searchRegex }, { content: searchRegex }, { tags: searchRegex }],
        isActive: true,
      }).populate('authorId', 'name').populate('communityId', 'name slug').limit(5),

      Event.find({
        $or: [{ title: searchRegex }, { description: searchRegex }],
        isActive: true,
        isCancelled: false,
      }).populate('communityId', 'name slug').limit(5),
    ]);

    return {
      query,
      results: {
        users,
        communities,
        posts,
        events,
      },
      counts: {
        users: users.length,
        communities: communities.length,
        posts: posts.length,
        events: events.length,
        total: users.length + communities.length + posts.length + events.length,
      },
    };
  }

  async searchCommunities(query, { page = 1, limit = 10, category }) {

    const searchRegex = new RegExp(escapeRegex(query.trim()), 'i');
    const filter = {
      $or: [{ name: searchRegex }, { description: searchRegex }, { tags: searchRegex }],
      isActive: true,
    };
    if (category) filter.category = category;

    const skip = (page - 1) * limit;
    const total = await Community.countDocuments(filter);
    const communities = await Community.find(filter)
      .sort({ memberCount: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    return {
      communities,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) },
    };
  }

  async searchPosts(query, { page = 1, limit = 10, communityId }) {
    const searchRegex = new RegExp(escapeRegex(query.trim()), 'i');
    const filter = {
      $or: [{ title: searchRegex }, { content: searchRegex }, { tags: searchRegex }],
      isActive: true,
    };
    if (communityId) filter.communityId = communityId;

    const skip = (page - 1) * limit;
    const total = await Post.countDocuments(filter);
    const posts = await Post.find(filter)
      .populate('authorId', 'name')
      .populate('communityId', 'name slug')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    return {
      posts,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) },
    };
  }
}

module.exports = new SearchService();