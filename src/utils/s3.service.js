const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const path   = require('path');
const logger = require('./logger');

/**
 * S3 Service — AWS S3 Media & Asset storage
 *
 * NC-01 FIX: this.bucket was reading process.env.AWS_S3_BUCKET
 *
 * 3-way mismatch existed:
 *   s3.service.js  → process.env.AWS_S3_BUCKET   ← what was read
 *   env.js         → validates 'S3_BUCKET_NAME'   ← what startup checks
 *   .env.example   → S3_BUCKET_NAME=your-bucket   ← what devs set
 *
 * This caused two problems:
 *   1. env.js startup validation FAILS because S3_BUCKET_NAME is absent
 *   2. Even if startup passed, any env set from the example would be ignored
 *      because s3.service.js read a DIFFERENT key (AWS_S3_BUCKET)
 *
 * Fix: standardize everything to S3_BUCKET_NAME.
 *   - This file: reads process.env.S3_BUCKET_NAME  ✓
 *   - env.js: already validates S3_BUCKET_NAME     ✓
 *   - .env: must add S3_BUCKET_NAME=circlecore-backend-private (see deployment note)
 *
 * IMPORTANT — update your .env file:
 *   Change:  AWS_S3_BUCKET=circlecore-backend-private
 *   To:      S3_BUCKET_NAME=circlecore-backend-private
 *   (OR add a new line: S3_BUCKET_NAME=circlecore-backend-private)
 */

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_FILE_TYPES  = [
  ...ALLOWED_IMAGE_TYPES,
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

const SIZE_LIMITS = {
  avatar:    5 * 1024 * 1024,  // 5MB
  post:     20 * 1024 * 1024,  // 20MB
  community: 5 * 1024 * 1024,  // 5MB
  event:     5 * 1024 * 1024,  // 5MB
};

class S3Service {

  constructor() {
    this.client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    // NC-01 FIX: was process.env.AWS_S3_BUCKET — now reads the correct key
    this.bucket = process.env.S3_BUCKET_NAME;
  }

  /**
   * Upload a file to S3
   * @param {Buffer} buffer       - File buffer from multer (req.file.buffer)
   * @param {string} mimetype     - MIME type (req.file.mimetype)
   * @param {string} originalname - Original filename (req.file.originalname)
   * @param {string} folder       - Destination folder: 'avatars'|'posts'|'communities'|'events'
   * @returns {object}            - { key, size, mimetype, originalname }
   */
  async uploadFile(buffer, mimetype, originalname, folder = 'posts') {
    if (!ALLOWED_FILE_TYPES.includes(mimetype)) {
      throw Object.assign(
        new Error('File type not allowed. Allowed: images, PDF, Word, text files'),
        { statusCode: 400 }
      );
    }

    const extension = path.extname(originalname).toLowerCase() || '.bin';
    const uniqueId  = crypto.randomUUID();
    const key       = `${folder}/${uniqueId}${extension}`;

    const command = new PutObjectCommand({
      Bucket:      this.bucket,
      Key:         key,
      Body:        buffer,
      ContentType: mimetype,
    });

    await this.client.send(command);
    logger.info(`S3 upload success: ${key} (${buffer.length} bytes)`);

    return { key, size: buffer.length, mimetype, originalname };
  }

  /**
   * Generate a presigned URL for private file access
   * @param {string} key       - S3 object key
   * @param {number} expiresIn - Expiry in seconds (default: 3600 = 1 hour)
   * @returns {string}         - Presigned URL
   */
  async getPresignedUrl(key, expiresIn = 3600) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key:    key,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  /**
   * Delete a file from S3
   * @param {string} key - S3 object key
   */
  async deleteFile(key) {
    if (!key) return;

    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key:    key,
    });

    await this.client.send(command);
    logger.info(`S3 delete success: ${key}`);
  }

  isImageType(mimetype)  { return ALLOWED_IMAGE_TYPES.includes(mimetype); }
  getSizeLimit(folder)   { return SIZE_LIMITS[folder] || SIZE_LIMITS.post; }
}

module.exports = new S3Service();
