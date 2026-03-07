const multer = require('multer');

/**
 * Upload Middleware
 * Document requirement: Architecture Overview — AWS S3 (Media & Assets)
 *
 * Uses multer with memory storage — files are held in buffer,
 * then passed to s3.service.js for upload. Nothing is written to disk.
 *
 * Usage in routes:
 *   router.post('/upload', authenticate, uploadMiddleware.single('file'), uploadController.upload);
 *   router.post('/upload/avatar', authenticate, uploadMiddleware.avatar, uploadController.uploadAvatar);
 */

// ─── Memory storage — no disk writes ──────────────────────────────────────────
const storage = multer.memoryStorage();

// ─── File filter — validate mime type before multer accepts the file ──────────
const fileFilter = (req, file, cb) => {
  const allowed = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ];

  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      Object.assign(
        new Error('File type not allowed. Allowed types: JPEG, PNG, GIF, WebP, PDF, DOC, DOCX, TXT'),
        { statusCode: 400 }
      ),
      false
    );
  }
};

// ─── General upload — 20MB limit for post media ───────────────────────────────
const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

// ─── Avatar upload — 5MB limit, images only ───────────────────────────────────
const avatarFilter = (req, file, cb) => {
  const imageOnly = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (imageOnly.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      Object.assign(
        new Error('Avatar must be an image. Allowed types: JPEG, PNG, GIF, WebP'),
        { statusCode: 400 }
      ),
      false
    );
  }
};

const avatarUpload = multer({
  storage,
  fileFilter: avatarFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// ─── Community/Event cover image — 5MB limit, images only ────────────────────
const coverUpload = multer({
  storage,
  fileFilter: avatarFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

module.exports = {
  // General: single file, field name 'file'
  single: uploadMiddleware.single('file'),
  // Multiple files, up to 10, field name 'files'
  multiple: uploadMiddleware.array('files', 10),
  // Avatar: single image, field name 'avatar'
  avatar: avatarUpload.single('avatar'),
  // Cover image: single image, field name 'cover'
  cover: coverUpload.single('cover'),
};