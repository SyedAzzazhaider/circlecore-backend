const searchService = require('./search.service');
const ApiResponse = require('../../utils/apiResponse');

class SearchController {

  async globalSearch(req, res, next) {
    try {
      const { q, page, limit } = req.query;
      if (!q) return ApiResponse.error(res, 'Search query is required', 400);
      const result = await searchService.globalSearch(q, { page, limit });
      return ApiResponse.success(res, result, 'Search results fetched');
    } catch (error) { next(error); }
  }

  async searchCommunities(req, res, next) {
    try {
      const { q, page, limit, category } = req.query;
      if (!q) return ApiResponse.error(res, 'Search query is required', 400);
      const result = await searchService.searchCommunities(q, { page, limit, category });
      return ApiResponse.success(res, result, 'Communities search results');
    } catch (error) { next(error); }
  }

  async searchPosts(req, res, next) {
    try {
      const { q, page, limit, communityId } = req.query;
      if (!q) return ApiResponse.error(res, 'Search query is required', 400);
      const result = await searchService.searchPosts(q, { page, limit, communityId });
      return ApiResponse.success(res, result, 'Posts search results');
    } catch (error) { next(error); }
  }
}

module.exports = new SearchController();