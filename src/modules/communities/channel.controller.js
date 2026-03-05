const channelService = require('./channel.service');
const ApiResponse = require('../../utils/apiResponse');

class ChannelController {

  async create(req, res, next) {
    try {
      const { communityId, name, description, type, isPrivate } = req.body;
      const channel = await channelService.createChannel({
        communityId, name, description, type, isPrivate,
        createdBy: req.user._id,
      });
      return ApiResponse.created(res, { channel }, 'Channel created successfully');
    } catch (error) { next(error); }
  }

  async getCommunityChannels(req, res, next) {
    try {
      const channels = await channelService.getCommunityChannels(req.params.communityId);
      return ApiResponse.success(res, { channels }, 'Channels fetched');
    } catch (error) { next(error); }
  }

  async getById(req, res, next) {
    try {
      const channel = await channelService.getChannelById(req.params.id);
      return ApiResponse.success(res, { channel }, 'Channel fetched');
    } catch (error) { next(error); }
  }

  async update(req, res, next) {
    try {
      const channel = await channelService.updateChannel(
        req.params.id, req.user._id, req.body
      );
      return ApiResponse.success(res, { channel }, 'Channel updated successfully');
    } catch (error) { next(error); }
  }

  async archive(req, res, next) {
    try {
      const result = await channelService.archiveChannel(req.params.id, req.user._id);
      return ApiResponse.success(res, result, result.message);
    } catch (error) { next(error); }
  }
}

module.exports = new ChannelController();