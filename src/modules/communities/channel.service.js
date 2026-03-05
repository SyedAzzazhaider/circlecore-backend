const Channel = require('./channel.model');
const Community = require('./community.model');
const logger = require('../../utils/logger');

/**
 * Channel Service — nested categorization inside communities
 * Document requirement: MODULE C — Nested categorizations
 */
class ChannelService {

  async createChannel({ communityId, name, description, type, isPrivate, createdBy }) {
    const community = await Community.findById(communityId);
    if (!community) throw Object.assign(new Error('Community not found'), { statusCode: 404 });

    const memberRole = community.getMemberRole(createdBy);
    if (!memberRole || !['admin', 'moderator'].includes(memberRole)) {
      throw Object.assign(new Error('Only admins and moderators can create channels'), { statusCode: 403 });
    }

    const existing = await Channel.findOne({
      communityId,
      slug: name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-'),
    });
    if (existing) throw Object.assign(new Error('A channel with this name already exists'), { statusCode: 409 });

    const count = await Channel.countDocuments({ communityId });

    const channel = await Channel.create({
      communityId,
      name,
      description: description || '',
      type: type || 'general',
      isPrivate: isPrivate || false,
      createdBy,
      order: count,
    });

    logger.info('Channel created: ' + channel.slug + ' in community: ' + communityId);
    return channel;
  }

  async getCommunityChannels(communityId) {
    const channels = await Channel.find({
      communityId,
      isArchived: false,
    }).sort({ order: 1 });
    return channels;
  }

  async getChannelById(channelId) {
    const channel = await Channel.findById(channelId);
    if (!channel) throw Object.assign(new Error('Channel not found'), { statusCode: 404 });
    return channel;
  }

  async updateChannel(channelId, userId, updates) {
    const channel = await Channel.findById(channelId);
    if (!channel) throw Object.assign(new Error('Channel not found'), { statusCode: 404 });

    const community = await Community.findById(channel.communityId);
    const memberRole = community.getMemberRole(userId);
    if (!memberRole || !['admin', 'moderator'].includes(memberRole)) {
      throw Object.assign(new Error('Only admins and moderators can update channels'), { statusCode: 403 });
    }

    const allowed = ['name', 'description', 'type', 'isPrivate', 'order'];
    allowed.forEach(field => {
      if (updates[field] !== undefined) channel[field] = updates[field];
    });

    await channel.save();
    logger.info('Channel updated: ' + channel._id);
    return channel;
  }

  async archiveChannel(channelId, userId) {
    const channel = await Channel.findById(channelId);
    if (!channel) throw Object.assign(new Error('Channel not found'), { statusCode: 404 });

    const community = await Community.findById(channel.communityId);
    const memberRole = community.getMemberRole(userId);
    if (!['admin'].includes(memberRole)) {
      throw Object.assign(new Error('Only admins can archive channels'), { statusCode: 403 });
    }

    channel.isArchived = true;
    await channel.save();
    logger.info('Channel archived: ' + channel._id);
    return { message: 'Channel archived successfully' };
  }
}

module.exports = new ChannelService();