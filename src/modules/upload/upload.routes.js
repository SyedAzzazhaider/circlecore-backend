const express = require('express');
const router = express.Router();
const uploadController = require('./upload.controller');
const { authenticate } = require('../../middleware/authenticate');
const { checkSessionTimeout } = require('../../middleware/sessionTimeout');
const uploadMiddleware = require('../../middleware/upload.middleware');
const rateLimit = require('express-rate-limit');

/**
 * Upload Routes
 * Document requirement: Architecture Overview — AWS S3 (Media & Assets)
 *
 * Base path: /api/upload
 * All routes require authentication.
 */

// Rate limiter — max 20 uploads per 10 minutes per user
const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many uploads, please try again later' },
});

const protect = [authenticate, checkSessionTimeout];

// POST /api/upload — general file upload (post media)
router.post(
  '/',
  ...protect,
  uploadLimiter,
  uploadMiddleware.single,
  uploadController.upload.bind(uploadController)
);

// POST /api/upload/avatar — profile avatar
router.post(
  '/avatar',
  ...protect,
  uploadLimiter,
  uploadMiddleware.avatar,
  uploadController.uploadAvatar.bind(uploadController)
);

// POST /api/upload/cover — community or event cover image
// Query param: ?type=event  or  ?type=community
router.post(
  '/cover',
  ...protect,
  uploadLimiter,
  uploadMiddleware.cover,
  uploadController.uploadCover.bind(uploadController)
);

// GET /api/upload/url/:key — get fresh presigned URL for a private file
router.get(
  '/url/:key',
  ...protect,
  uploadController.getPresignedUrl.bind(uploadController)
);

// DELETE /api/upload — delete a file
router.delete(
  '/',
  ...protect,
  uploadController.deleteFile.bind(uploadController)
);

module.exports = router;