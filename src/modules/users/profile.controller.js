const Profile = require('./profile.model');
const User = require('../auth/auth.model');
const ApiResponse = require('../../utils/apiResponse');
const logger = require('../../utils/logger');

class ProfileController {

  async getMyProfile(req, res, next) {
    try {
      const profile = await Profile.findOne({ userId: req.user._id });
      if (!profile) return ApiResponse.notFound(res, 'Profile not found');
      return ApiResponse.success(res, { profile }, 'Profile fetched');
    } catch (error) {
      next(error);
    }
  }

  async getProfileByUserId(req, res, next) {
    try {
      const profile = await Profile.findOne({ userId: req.params.userId });
      if (!profile) return ApiResponse.notFound(res, 'Profile not found');
      if (!profile.isPublic) return ApiResponse.forbidden(res, 'This profile is private');
      return ApiResponse.success(res, { profile }, 'Profile fetched');
    } catch (error) {
      next(error);
    }
  }

  async updateMyProfile(req, res, next) {
    try {
      const allowed = ['bio', 'location', 'website', 'skills', 'interests', 'socialLinks', 'isPublic'];
      const updates = {};
      allowed.forEach(field => {
        if (req.body[field] !== undefined) updates[field] = req.body[field];
      });

      const profile = await Profile.findOneAndUpdate(
        { userId: req.user._id },
        updates,
        { returnDocument: 'after', runValidators: true }
      );

      if (!profile) return ApiResponse.notFound(res, 'Profile not found');
      logger.info('Profile updated for user: ' + req.user._id);
      return ApiResponse.success(res, { profile }, 'Profile updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateAvatar(req, res, next) {
    try {
      if (!req.body.avatarUrl) return ApiResponse.error(res, 'Avatar URL is required', 400);

      const profile = await Profile.findOneAndUpdate(
        { userId: req.user._id },
        { avatar: req.body.avatarUrl },
        { returnDocument: 'after' }
      );

      if (!profile) return ApiResponse.notFound(res, 'Profile not found');
      return ApiResponse.success(res, { profile }, 'Avatar updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async getPublicProfile(req, res, next) {
    try {
      const user = await User.findById(req.params.userId).select('name email createdAt role');
      if (!user) return ApiResponse.notFound(res, 'User not found');

      const profile = await Profile.findOne({ userId: req.params.userId });
      if (!profile || !profile.isPublic) return ApiResponse.forbidden(res, 'Profile is private');

      return ApiResponse.success(res, { user, profile }, 'Public profile fetched');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ProfileController();