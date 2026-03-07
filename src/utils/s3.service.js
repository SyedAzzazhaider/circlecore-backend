const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const path = require('path');
const logger = require('./logger');
/**
 * S3 Service
 * Document requirement: Architecture Overview — AWS S3 (Media & Assets)
 *
 * Handles all file upload/download operations with AWS S3.
 * Files are stored privately — access is via presigned URLs (time-limited).
 *
 * Folder structure inside bucket:
 *   avatars/       → profile pictures
 *   posts/         → post media (images, files)
 *   communities/   → community cover images, avatars
 *   events/        → event cover images
 *
 * Security:
 *   - Bucket is fully private (no public access)
 *   - All file access is via presigned URLs (default 1 hour expiry)
 *   - File type validation before upload
 *   - File size limits enforced at multer middleware layer
 *   - Random UUID filenames prevent enumeration attacks
 */

// ─── Allowed file types ────────────────────────────────────────────────────────
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_FILE_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

// ─── Size limits ───────────────────────────────────────────────────────────────
const SIZE_LIMITS = {
  avatar: 5 * 1024 * 1024,    // 5MB
  post: 20 * 1024 * 1024,     // 20MB
  community: 5 * 1024 * 1024, // 5MB
  event: 5 * 1024 * 1024,     // 5MB
};

class S3Service {

  constructor() {
    this.client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    this.bucket = process.env.AWS_S3_BUCKET;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UPLOAD — stores file buffer directly to S3
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Upload a file to S3
   * @param {Buffer} buffer       - File buffer from multer (req.file.buffer)
   * @param {string} mimetype     - MIME type (req.file.mimetype)
   * @param {string} originalname - Original filename (req.file.originalname)
   * @param {string} folder       - Destination folder: 'avatars'|'posts'|'communities'|'events'
   * @returns {object}            - { key, url, size, mimetype }
   */
  async uploadFile(buffer, mimetype, originalname, folder = 'posts') {
    // Validate mime type
    if (!ALLOWED_FILE_TYPES.includes(mimetype)) {
      throw Object.assign(
        new Error('File type not allowed. Allowed: images, PDF, Word, text files'),
        { statusCode: 400 }
      );
    }

    // Generate unique filename — prevents enumeration and collisions
    const extension = path.extname(originalname).toLowerCase() || '.bin';
    const uniqueId = crypto.randomUUID();
    const key = `${folder}/${uniqueId}${extension}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
      // No ACL — bucket is private, access via presigned URLs only
    });

    await this.client.send(command);

    logger.info(`S3 upload success: ${key} (${buffer.length} bytes)`);

    return {
      key,
      size: buffer.length,
      mimetype,
      originalname,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRESIGNED URL — generates a time-limited access URL for a private file
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Generate a presigned URL for private file access
   * @param {string} key          - S3 object key
   * @param {number} expiresIn    - Expiry in seconds (default: 3600 = 1 hour)
   * @returns {string}            - Presigned URL
   */
  async getPresignedUrl(key, expiresIn = 3600) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });
    return url;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE — removes a file from S3
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Delete a file from S3
   * @param {string} key - S3 object key
   */
  async deleteFile(key) {
    if (!key) return;

    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
    logger.info(`S3 delete success: ${key}`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  isImageType(mimetype) {
    return ALLOWED_IMAGE_TYPES.includes(mimetype);
  }

  getSizeLimit(folder) {
    return SIZE_LIMITS[folder] || SIZE_LIMITS.post;
  }
}

module.exports = new S3Service();