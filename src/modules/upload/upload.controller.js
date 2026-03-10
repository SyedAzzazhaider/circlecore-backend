const s3Service = require('../../utils/s3.service');
const ApiResponse = require('../../utils/apiResponse');
const logger = require('../../utils/logger');

/**
 * Upload Controller
 * Document requirement: Architecture Overview — AWS S3 (Media & Assets)
 *
 * Handles file uploads for:
 *   POST /api/upload           → general file/image upload (for posts)
 *   POST /api/upload/avatar    → profile avatar upload
 *   POST /api/upload/cover     → community or event cover image
 *   GET  /api/upload/url/:key  → get fresh presigned URL for a private file
 *   DELETE /api/upload         → delete a file (owner only)
 *
 * CDN FIX: uploadFile() now returns a permanent URL via s3Service.getFileUrl().
 *   getFileUrl() uses CLOUDFRONT_URL if set, otherwise falls back to direct S3 URL.
 *   Previously avatar and cover used presigned URLs which expire after 1 hour —
 *   breaking any profile image or community cover after that window.
 *   Posts had no URL at all — only a key was returned.
 */

class UploadController {

  /**
   * POST /api/upload
   * General file upload — used for post media attachments
   */
  async upload(req, res, next) {
    try {
      if (!req.file) {
        return ApiResponse.badRequest(res, 'No file provided');
      }

      const result = await s3Service.uploadFile(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname,
        'posts'
      );

      logger.info(`File uploaded by user ${req.user._id}: ${result.key}`);

      return ApiResponse.created(res, {
        upload: {
          key:          result.key,
          url:          s3Service.getFileUrl(result.key),
          size:         result.size,
          mimetype:     result.mimetype,
          originalname: result.originalname,
        }
      }, 'File uploaded successfully');

    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/upload/avatar
   * Profile avatar upload
   */
  async uploadAvatar(req, res, next) {
    try {
      if (!req.file) {
        return ApiResponse.badRequest(res, 'No image provided');
      }

      // Delete old avatar from S3 if it exists
      const Profile = require('../users/profile.model');
      const profile = await Profile.findOne({ userId: req.user._id });
      if (profile?.avatarKey) {
        try {
          await s3Service.deleteFile(profile.avatarKey);
        } catch (e) {
          logger.warn('Old avatar delete failed: ' + e.message);
        }
      }

      const result = await s3Service.uploadFile(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname,
        'avatars'
      );

      // CDN FIX: permanent URL — presigned URLs expire after 1 hour and
      // break the profile image for any user who does not refresh the page.
      const url = s3Service.getFileUrl(result.key);

      // Persist both the key (for future deletion) and the resolved URL
      await Profile.findOneAndUpdate(
        { userId: req.user._id },
        { avatarKey: result.key, avatar: url },
        { returnDocument: 'after' }
      );

      logger.info(`Avatar uploaded by user ${req.user._id}: ${result.key}`);

      return ApiResponse.success(res, {
        upload: {
          key:      result.key,
          url,
          size:     result.size,
          mimetype: result.mimetype,
        }
      }, 'Avatar uploaded successfully');

    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/upload/cover
   * Community or event cover image upload
   */
  async uploadCover(req, res, next) {
    try {
      if (!req.file) {
        return ApiResponse.badRequest(res, 'No image provided');
      }

      const folder = req.query.type === 'event' ? 'events' : 'communities';

      const result = await s3Service.uploadFile(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname,
        folder
      );

      // CDN FIX: permanent URL — presigned URLs expire after 1 hour and
      // break community/event covers for users who do not refresh.
      const url = s3Service.getFileUrl(result.key);

      logger.info(`Cover uploaded by user ${req.user._id}: ${result.key}`);

      return ApiResponse.created(res, {
        upload: {
          key:      result.key,
          url,
          size:     result.size,
          mimetype: result.mimetype,
        }
      }, 'Cover image uploaded successfully');

    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/upload/url/:key
   * Generate a fresh presigned URL for accessing a private file.
   * Frontend calls this when a presigned URL has expired (private documents only).
   */
  async getPresignedUrl(req, res, next) {
    try {
      const { key } = req.params;

      if (!key) {
        return ApiResponse.badRequest(res, 'File key is required');
      }

      const decodedKey = decodeURIComponent(key);
      const url = await s3Service.getPresignedUrl(decodedKey, 3600);

      return ApiResponse.success(res, { url, expiresIn: 3600 }, 'Presigned URL generated');

    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/upload
   * Delete a file from S3 — owner only
   */
  async deleteFile(req, res, next) {
    try {
      const { key } = req.body;

      if (!key) {
        return ApiResponse.badRequest(res, 'File key is required');
      }

      await s3Service.deleteFile(key);

      logger.info(`File deleted by user ${req.user._id}: ${key}`);

      return ApiResponse.success(res, null, 'File deleted successfully');

    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UploadController();