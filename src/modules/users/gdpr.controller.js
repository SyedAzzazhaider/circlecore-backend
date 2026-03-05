const User = require('../auth/auth.model');
const Profile = require('./profile.model');
const Post = require('../posts/post.model');
const Comment = require('../comments/comment.model');
const Notification = require('../notifications/notification.model');
const ApiResponse = require('../../utils/apiResponse');
const logger = require('../../utils/logger');

/**
 * GDPR Controller
 * Document requirement: Security & Compliance — GDPR compliance
 * Right to data export + right to delete
 */
class GdprController {

  /**
   * GDPR: Export all user data
   * GET /api/gdpr/export
   */
  async exportData(req, res, next) {
    try {
      const userId = req.user._id;

      const [user, profile, posts, comments, notifications] = await Promise.all([
        User.findById(userId).select('-password -refreshTokens -emailVerificationToken -passwordResetToken'),
        Profile.findOne({ userId }),
        Post.find({ authorId: userId, isActive: true }).select('title content type tags createdAt'),
        Comment.find({ authorId: userId, isActive: true }).select('content postId createdAt'),
        Notification.find({ userId }).select('type title message isRead createdAt').limit(100),
      ]);

      const exportData = {
        exportedAt: new Date().toISOString(),
        account: user,
        profile: profile,
        posts: {
          total: posts.length,
          data: posts,
        },
        comments: {
          total: comments.length,
          data: comments,
        },
        notifications: {
          total: notifications.length,
          data: notifications,
        },
      };

      logger.info('GDPR data export for user: ' + userId);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="circlecore-data-export-' + userId + '.json"'
      );
      res.send(JSON.stringify(exportData, null, 2));

    } catch (error) { next(error); }
  }

  /**
   * GDPR: Right to delete — permanently delete all user data
   * DELETE /api/gdpr/delete-account
   */
  async deleteAccount(req, res, next) {
    try {
      const userId = req.user._id;
      const { confirmPassword } = req.body;

      if (!confirmPassword) {
        return res.status(400).json({
          success: false,
          message: 'Please confirm your password to delete your account',
        });
      }

      // Verify password before deletion
      const user = await User.findById(userId).select('+password');
      const isValid = await user.comparePassword(confirmPassword);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'Incorrect password. Account deletion cancelled.',
        });
      }

      // Soft delete posts — mark inactive
      await Post.updateMany({ authorId: userId }, { isActive: false });

      // Soft delete comments — mark inactive
      await Comment.updateMany({ authorId: userId }, { isActive: false });

      // Delete notifications
      await Notification.deleteMany({ userId });

      // Delete profile
      await Profile.findOneAndDelete({ userId });

      // Hard delete user account
      await User.findByIdAndDelete(userId);

      logger.info('GDPR account deletion completed for user: ' + userId);

      res.clearCookie('refreshToken');
      return ApiResponse.success(res, {}, 'Account and all associated data deleted successfully');

    } catch (error) { next(error); }
  }

  /**
   * GDPR: Anonymize user data — alternative to full deletion
   * POST /api/gdpr/anonymize
   */
  async anonymizeAccount(req, res, next) {
    try {
      const userId = req.user._id;

      const anonymousName = 'DeletedUser_' + userId.toString().slice(-6);
      const anonymousEmail = 'deleted_' + userId.toString() + '@anonymized.circlecore.app';

      // Anonymize user account
      await User.findByIdAndUpdate(userId, {
        name: anonymousName,
        email: anonymousEmail,
        isEmailVerified: false,
        isSuspended: true,
        refreshTokens: [],
        oauthId: null,
      });

      // Anonymize profile
      await Profile.findOneAndUpdate({ userId }, {
        avatar: null,
        bio: '',
        location: '',
        website: '',
        skills: [],
        interests: [],
        socialLinks: { twitter: '', linkedin: '', github: '' },
        isPublic: false,
      });

      logger.info('GDPR anonymization completed for user: ' + userId);

      res.clearCookie('refreshToken');
      return ApiResponse.success(res, {}, 'Account anonymized successfully');

    } catch (error) { next(error); }
  }
}

module.exports = new GdprController();