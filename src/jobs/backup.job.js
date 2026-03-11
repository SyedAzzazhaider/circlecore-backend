const { execFile } = require('child_process');
const path         = require('path');
const fs           = require('fs');
const os           = require('os');
const cron         = require('node-cron');
const logger       = require('../utils/logger');

/**
 * Backup Job
 * Document requirement: Architecture Overview — Daily Automated Backups
 *
 * Schedule: 0 2 * * * — runs every day at 2:00 AM UTC
 *
 * Flow:
 *   1. Run mongodump → compress to .gz in /tmp
 *   2. Upload compressed archive to S3 under BACKUP_S3_FOLDER/
 *   3. Delete archives older than BACKUP_RETENTION_DAYS from S3
 *   4. Clean up local /tmp file
 *
 * S3 key format: backups/2026-03-11T02-00-00.gz
 */

class BackupJob {

  async run() {
    const timestamp  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const tmpFile    = path.join(os.tmpdir(), `circlecore-backup-${timestamp}.gz`);
    const folder     = process.env.BACKUP_S3_FOLDER || 'backups';
    const s3Key      = `${folder}/${timestamp}.gz`;

    logger.info('[Backup] Starting daily backup: ' + timestamp);

    try {
      // Step 1 — Run mongodump and pipe to gzip
      await this._runMongodump(tmpFile);
      logger.info('[Backup] mongodump complete — file: ' + tmpFile);

      // Step 2 — Upload to S3
      await this._uploadToS3(tmpFile, s3Key);
      logger.info('[Backup] Uploaded to S3: ' + s3Key);

      // Step 3 — Prune old backups
      await this._pruneOldBackups(folder);

      // Step 4 — Clean up local temp file
      fs.unlinkSync(tmpFile);
      logger.info('[Backup] Daily backup completed successfully: ' + s3Key);

    } catch (error) {
      logger.error('[Backup] Backup failed: ' + error.message);
      // Clean up temp file if it exists
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (_) {}
    }
  }

  _runMongodump(outputFile) {
    return new Promise((resolve, reject) => {
      const uri  = process.env.MONGODB_URI;
      const args = [
        `--uri=${uri}`,
        '--archive=' + outputFile,
        '--gzip',
      ];

      execFile('mongodump', args, { timeout: 5 * 60 * 1000 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error('mongodump failed: ' + (stderr || error.message)));
          return;
        }
        resolve();
      });
    });
  }

  async _uploadToS3(filePath, s3Key) {
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    const client = new S3Client({ region: process.env.AWS_REGION });

    const fileBuffer = fs.readFileSync(filePath);
    const fileSizeMB = (fileBuffer.length / 1024 / 1024).toFixed(2);

    logger.info('[Backup] Uploading ' + fileSizeMB + ' MB to S3...');

    await client.send(new PutObjectCommand({
      Bucket:      process.env.S3_BUCKET_NAME,
      Key:         s3Key,
      Body:        fileBuffer,
      ContentType: 'application/gzip',
      Metadata: {
        createdAt:   new Date().toISOString(),
        environment: process.env.NODE_ENV || 'production',
      },
    }));
  }

  async _pruneOldBackups(folder) {
    const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
    const client         = new S3Client({ region: process.env.AWS_REGION });
    const retentionDays  = parseInt(process.env.BACKUP_RETENTION_DAYS || '30');
    const cutoff         = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const listResult = await client.send(new ListObjectsV2Command({
      Bucket: process.env.S3_BUCKET_NAME,
      Prefix: folder + '/',
    }));

    if (!listResult.Contents || listResult.Contents.length === 0) return;

    const toDelete = listResult.Contents.filter(obj => new Date(obj.LastModified) < cutoff);

    if (toDelete.length === 0) {
      logger.info('[Backup] No old backups to prune');
      return;
    }

    await client.send(new DeleteObjectsCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Delete: {
        Objects: toDelete.map(obj => ({ Key: obj.Key })),
        Quiet:   true,
      },
    }));

    logger.info('[Backup] Pruned ' + toDelete.length + ' old backup(s) older than ' + retentionDays + ' days');
  }

  schedule() {
    // 0 2 * * * — every day at 2:00 AM UTC
    cron.schedule('0 2 * * *', () => {
      this.run();
    }, { timezone: 'UTC' });

    logger.info('[Backup] Daily backup scheduled — runs at 02:00 UTC');
  }
}

module.exports = new BackupJob();