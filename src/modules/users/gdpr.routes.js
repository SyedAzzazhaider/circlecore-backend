const express = require('express');
const router = express.Router();
const gdprController = require('./gdpr.controller');
const { authenticate } = require('../../middleware/authenticate');

/**
 * GDPR Routes
 * Document requirement: Security & Compliance — GDPR compliance
 */

router.get('/export', authenticate, gdprController.exportData);
router.delete('/delete-account', authenticate, gdprController.deleteAccount);
router.post('/anonymize', authenticate, gdprController.anonymizeAccount);

module.exports = router;