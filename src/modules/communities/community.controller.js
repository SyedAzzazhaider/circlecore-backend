const communityService = require('./community.service');
const ApiResponse = require('../../utils/apiResponse');

class CommunityController {

  async create(req, res, next) {
    try {
      const { name, description, category, tags, rules, isPrivate } = req.body;
      const community = await communityService.createCommunity({
        name, description, category, tags, rules, isPrivate,
        createdBy: req.user._id,
      });
      return ApiResponse.created(res, { community }, 'Community created successfully');
    } catch (error) { next(error); }
  }

  async getAll(req, res, next) {
    try {
      const { page, limit, category, search } = req.query;
      const result = await communityService.getAllCommunities({ page, limit, category, search });
      return ApiResponse.success(res, result, 'Communities fetched');
    } catch (error) { next(error); }
  }

  async getBySlug(req, res, next) {
    try {
      const community = await communityService.getCommunityBySlug(req.params.slug);
      return ApiResponse.success(res, { community }, 'Community fetched');
    } catch (error) { next(error); }
  }

  async getById(req, res, next) {
    try {
      const community = await communityService.getCommunityById(req.params.id);
      return ApiResponse.success(res, { community }, 'Community fetched');
    } catch (error) { next(error); }
  }

  async join(req, res, next) {
    try {
      const community = await communityService.joinCommunity(req.params.id, req.user._id);
      return ApiResponse.success(res, { community }, 'Joined community successfully');
    } catch (error) { next(error); }
  }

  async leave(req, res, next) {
    try {
      const result = await communityService.leaveCommunity(req.params.id, req.user._id);
      return ApiResponse.success(res, result, result.message);
    } catch (error) { next(error); }
  }

  async getMyCommunities(req, res, next) {
    try {
      const communities = await communityService.getMyCommunities(req.user._id);
      return ApiResponse.success(res, { communities }, 'Your communities fetched');
    } catch (error) { next(error); }
  }

  async update(req, res, next) {
    try {
      const community = await communityService.updateCommunity(req.params.id, req.user._id, req.body);
      return ApiResponse.success(res, { community }, 'Community updated successfully');
    } catch (error) { next(error); }
  }
}

module.exports = new CommunityController();