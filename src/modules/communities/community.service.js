const Community = require('./community.model');
const User = require('../auth/auth.model');
const Blocklist = require('../moderation/blocklist.model');
const cache = require('../../utils/cache');
const logger = require('../../utils/logger');

class CommunityService {

  async createCommunity({ name, description, category, tags, rules, isPrivate, createdBy }) {
    const existing = await Community.findOne({
      slug: name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-')
    });
    if (existing) throw Object.assign(new Error('A community with this name already exists'), { statusCode: 409 });

    const community = await Community.create({
      name,
      description,
      category: category || 'other',
      tags: tags || [],
      rules: rules || [],
      isPrivate: isPrivate !== undefined ? isPrivate : true,
      createdBy,
      members: [{ userId: createdBy, role: 'admin', joinedAt: new Date() }],
      memberCount: 1,
    });

    await cache.deletePattern('communities:*');
    logger.info('Community created: ' + community.slug);
    return community;
  }

  async getCommunityBySlug(slug) {
    const cacheKey = cache.keys.community(slug);
    const cached = await cache.get(cacheKey);
    if (cached) {
      logger.info('Cache hit: community:' + slug);
      return cached;
    }

    const community = await Community.findOne({ slug, isActive: true })
      .populate('createdBy', 'name email');
    if (!community) throw Object.assign(new Error('Community not found'), { statusCode: 404 });

    await cache.set(cacheKey, community, 300);
    return community;
  }

  async getCommunityById(id) {
    const community = await Community.findById(id)
      .populate('createdBy', 'name email');
    if (!community) throw Object.assign(new Error('Community not found'), { statusCode: 404 });
    return community;
  }

  async getAllCommunities({ page = 1, limit = 10, category, search }) {
    const cacheKey = cache.keys.communityList(page);
    if (!category && !search) {
      const cached = await cache.get(cacheKey);
      if (cached) {
        logger.info('Cache hit: communities list page ' + page);
        return cached;
      }
    }

    const query = { isActive: true };
    if (category) query.category = category;
    if (search) query.$text = { $search: search };

    const skip = (page - 1) * limit;
    const total = await Community.countDocuments(query);
    const communities = await Community.find(query)
      .populate('createdBy', 'name')
      .sort({ memberCount: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const result = {
      communities,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      }
    };

    if (!category && !search) {
      await cache.set(cacheKey, result, 300);
    }

    return result;
  }

  async joinCommunity(communityId, userId) {
    const community = await Community.findById(communityId);
    if (!community) throw Object.assign(new Error('Community not found'), { statusCode: 404 });

    if (community.isMember(userId)) {
      throw Object.assign(new Error('You are already a member of this community'), { statusCode: 400 });
    }

    // FIX: check for active community ban before allowing rejoin — MODULE H requirement
    const activeBan = await Blocklist.findOne({
      type: 'community_ban',
      blockedUserId: userId,
      communityId,
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });
    if (activeBan) {
      throw Object.assign(new Error('You are banned from this community'), { statusCode: 403 });
    }

    community.members.push({ userId, role: 'member', joinedAt: new Date() });
    community.memberCount = community.members.length;
    await community.save();

    await cache.delete(cache.keys.community(community.slug));
    await cache.deletePattern('communities:*');

    logger.info('User ' + userId + ' joined community: ' + community.slug);

    // Document requirement: seniority tracking — check senior badge on join
    try {
      const reputationService = require('../users/reputation.service');
      await reputationService.checkAndAssignAutoBadge(userId);
    } catch (e) {
      logger.warn('Badge check failed on join: ' + e.message);
    }

    return community;
  }

  async leaveCommunity(communityId, userId) {
    const community = await Community.findById(communityId);
    if (!community) throw Object.assign(new Error('Community not found'), { statusCode: 404 });

    if (!community.isMember(userId)) {
      throw Object.assign(new Error('You are not a member of this community'), { statusCode: 400 });
    }

    if (community.createdBy.toString() === userId.toString()) {
      throw Object.assign(new Error('Community owner cannot leave. Transfer ownership first.'), { statusCode: 400 });
    }

    community.members = community.members.filter(m => m.userId.toString() !== userId.toString());
    community.memberCount = community.members.length;
    await community.save();

    await cache.delete(cache.keys.community(community.slug));
    await cache.deletePattern('communities:*');

    return { message: 'Left community successfully' };
  }

  async getMyCommunities(userId) {
    const communities = await Community.find({
      'members.userId': userId,
      isActive: true,
    }).populate('createdBy', 'name').sort({ createdAt: -1 });
    return communities;
  }

  async updateCommunity(communityId, userId, updates) {
    const community = await Community.findById(communityId);
    if (!community) throw Object.assign(new Error('Community not found'), { statusCode: 404 });

    const memberRole = community.getMemberRole(userId);
    if (!memberRole || !['admin', 'moderator'].includes(memberRole)) {
      throw Object.assign(new Error('Only admins and moderators can update the community'), { statusCode: 403 });
    }

    const allowed = ['description', 'tags', 'rules', 'category', 'avatar', 'coverImage'];
    allowed.forEach(field => {
      if (updates[field] !== undefined) community[field] = updates[field];
    });

    await community.save();

    await cache.delete(cache.keys.community(community.slug));
    await cache.deletePattern('communities:*');

    // Document requirement: moderator badges — assign when role is updated
    if (updates.promoteModerator) {
      try {
        const reputationService = require('../users/reputation.service');
        await reputationService.assignBadge(
          updates.promoteModerator,
          'moderator',
          'Community Moderator',
          userId
        );
      } catch (e) {
        logger.warn('Moderator badge assignment failed: ' + e.message);
      }
    }

    return community;
  }
}

module.exports = new CommunityService();