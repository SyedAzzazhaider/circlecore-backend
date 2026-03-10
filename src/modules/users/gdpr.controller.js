const User         = require('../auth/auth.model');
const Profile      = require('./profile.model');
const Post         = require('../posts/post.model');
const Comment      = require('../comments/comment.model');
const Notification = require('../notifications/notification.model');
const ApiResponse  = require('../../utils/apiResponse');
const logger       = require('../../utils/logger');

/**
 * GDPR Controller — Security & Compliance
 *
 * CC-14 FIX: updateEmailPreferences() added.
 *   Allows users to opt in or out of email digests at any time.
 *   Required by GDPR Article 7 (right to withdraw consent), CAN-SPAM, and CASL.
 */
class GdprController {

  // ─── CC-14 FIX: Email consent management ─────────────────────────────────
  // POST /api/gdpr/email-preferences
  // Body: { emailOptIn: true | false }
  //
  // Returns the updated preference so the frontend can reflect the change
  // immediately without a separate GET call.
  async updateEmailPreferences(req, res, next) {
    try {
      const { emailOptIn } = req.body;

      if (typeof emailOptIn !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'emailOptIn must be a boolean (true or false)',
        });
      }

      await User.findByIdAndUpdate(req.user._id, { emailOptIn });

      logger.info(
        'Email preferences updated for user: ' + req.user._id +
        ' — emailOptIn: ' + emailOptIn
      );

      return ApiResponse.success(res, { emailOptIn }, emailOptIn
        ? 'You have opted in to email digests'
        : 'You have opted out of email digests'
      );
    } catch (error) { next(error); }
  }

  // ─── GDPR: Export all user data ──────────────────────────────────────────
  // GET /api/gdpr/export
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
        account:    user,
        profile,
        posts:         { total: posts.length,         data: posts         },
        comments:      { total: comments.length,      data: comments      },
        notifications: { total: notifications.length, data: notifications },
      };

      logger.info('GDPR data export for user: ' + userId);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition',
        'attachment; filename="circlecore-data-export-' + userId + '.json"'
      );
      res.send(JSON.stringify(exportData, null, 2));

    } catch (error) { next(error); }
  }

  // ─── GDPR: Right to delete ────────────────────────────────────────────────
  // DELETE /api/gdpr/delete-account
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

      const user = await User.findById(userId).select('+password');
      const isValid = await user.comparePassword(confirmPassword);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'Incorrect password. Account deletion cancelled.',
        });
      }

      await Post.updateMany({ authorId: userId }, { isActive: false });
      await Comment.updateMany({ authorId: userId }, { isActive: false });
      await Notification.deleteMany({ userId });
      await Profile.findOneAndDelete({ userId });
      await User.findByIdAndDelete(userId);

      logger.info('GDPR account deletion completed for user: ' + userId);

      res.clearCookie('refreshToken');
      return ApiResponse.success(res, {}, 'Account and all associated data deleted successfully');

    } catch (error) { next(error); }
  }

  // ─── GDPR: Anonymize ──────────────────────────────────────────────────────
  // POST /api/gdpr/anonymize
  async anonymizeAccount(req, res, next) {
    try {
      const userId = req.user._id;

      const anonymousName  = 'DeletedUser_' + userId.toString().slice(-6);
      const anonymousEmail = 'deleted_' + userId.toString() + '@anonymized.circlecore.app';

      await User.findByIdAndUpdate(userId, {
        name:            anonymousName,
        email:           anonymousEmail,
        isEmailVerified: false,
        isSuspended:     true,
        emailOptIn:      false,
        refreshTokens:   [],
        oauthId:         null,
      });

      await Profile.findOneAndUpdate({ userId }, {
        avatar:      null,
        bio:         '',
        location:    '',
        website:     '',
        skills:      [],
        interests:   [],
        socialLinks: { twitter: '', linkedin: '', github: '' },
        isPublic:    false,
      });

      logger.info('GDPR anonymization completed for user: ' + userId);

      res.clearCookie('refreshToken');
      return ApiResponse.success(res, {}, 'Account anonymized successfully');

    } catch (error) { next(error); }
  }
}

module.exports = new GdprController();
