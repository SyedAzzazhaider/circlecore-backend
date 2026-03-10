const express = require('express');
const router  = express.Router();
const gdprController = require('./gdpr.controller');
const { authenticate } = require('../../middleware/authenticate');

/**
 * GDPR Routes — Security & Compliance
 *
 * CC-14 FIX: POST /email-preferences added.
 *   GDPR requires users to be able to opt in and opt out of commercial emails
 *   at any time. Previously no such endpoint existed — users had no mechanism
 *   to control email consent after registration.
 */

// Existing GDPR endpoints
router.get('/export',         authenticate, gdprController.exportData);
router.delete('/delete-account', authenticate, gdprController.deleteAccount);
router.post('/anonymize',     authenticate, gdprController.anonymizeAccount);

// CC-14 FIX: Email consent management
// POST body: { emailOptIn: true|false }
router.post('/email-preferences', authenticate, gdprController.updateEmailPreferences);

module.exports = router;
