const express = require('express');
const router  = express.Router();
const uploadController  = require('./upload.controller');
const { authenticate }  = require('../../middleware/authenticate');
const { checkSessionTimeout } = require('../../middleware/sessionTimeout');
const uploadMiddleware   = require('../../middleware/upload.middleware');
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { getRedis } = require('../../config/redis');
const logger = require('../../utils/logger');

/**
 * Upload Routes — AWS S3
 *
 * CC-26 FIX: uploadLimiter now uses Redis-backed store.
 *
 * Previously used default in-memory store. Under horizontal scaling
 * (multiple EC2 instances), the 20-upload limit was per-instance —
 * a user could upload 20 × N files by round-robining requests.
 * Now all instances share the same Redis counter.
 *
 * Gracefully falls back to in-memory if Redis is unavailable.
 */

const makeUploadStore = () => {
  try {
    const redis = getRedis();
    if (!redis || redis.status !== 'ready') {
      logger.warn('Upload limiter Redis unavailable — using in-memory fallback');
      return undefined;
    }
    return new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix: 'rl:upload:',
    });
  } catch (e) {
    logger.warn('Upload limiter Redis store init failed: ' + e.message);
    return undefined;
  }
};

// 20 uploads per 10 minutes per IP — Redis-backed
const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeUploadStore(),
  message: { success: false, message: 'Too many uploads, please try again later' },
});

const protect = [authenticate, checkSessionTimeout];

// POST /api/upload — general file upload (post media)
router.post('/',
  ...protect, uploadLimiter,
  uploadMiddleware.single,
  uploadController.upload.bind(uploadController)
);

// POST /api/upload/avatar — profile avatar
router.post('/avatar',
  ...protect, uploadLimiter,
  uploadMiddleware.avatar,
  uploadController.uploadAvatar.bind(uploadController)
);

// POST /api/upload/cover — community or event cover image
router.post('/cover',
  ...protect, uploadLimiter,
  uploadMiddleware.cover,
  uploadController.uploadCover.bind(uploadController)
);

// GET /api/upload/url/:key — get fresh presigned URL for a private S3 file
router.get('/url/:key',
  ...protect,
  uploadController.getPresignedUrl.bind(uploadController)
);

// DELETE /api/upload — delete a file from S3
router.delete('/',
  ...protect,
  uploadController.deleteFile.bind(uploadController)
);

module.exports = router;
