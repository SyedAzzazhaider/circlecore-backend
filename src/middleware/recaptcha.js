const axios = require('axios');
const logger = require('../utils/logger');

/**
 * reCAPTCHA v2/v3 verification middleware
 * Document requirement: MODULE A — reCAPTCHA anti-bot
 * Set RECAPTCHA_ENABLED=true in .env to enforce in production
 */
const verifyRecaptcha = async (req, res, next) => {
  try {
    // Skip verification if disabled (development/testing)
    if (process.env.RECAPTCHA_ENABLED !== 'true') {
      return next();
    }

    const token = req.body.recaptchaToken || req.headers['x-recaptcha-token'];

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'reCAPTCHA verification required',
      });
    }

    const secretKey = process.env.RECAPTCHA_SECRET_KEY;

    if (!secretKey) {
      logger.error('RECAPTCHA_SECRET_KEY not configured');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error',
      });
    }

    // Verify with Google reCAPTCHA API
    const response = await axios.post(
      'https://www.google.com/recaptcha/api/siteverify',
      null,
      {
        params: {
          secret: secretKey,
          response: token,
          remoteip: req.ip,
        },
        timeout: 5000,
      }
    );

    const { success, score, 'error-codes': errorCodes } = response.data;

    if (!success) {
      logger.warn('reCAPTCHA verification failed: ' + JSON.stringify(errorCodes));
      return res.status(400).json({
        success: false,
        message: 'reCAPTCHA verification failed. Please try again.',
      });
    }

    // For reCAPTCHA v3 — enforce minimum score threshold (0.5)
    if (score !== undefined && score < 0.5) {
      logger.warn('reCAPTCHA score too low: ' + score + ' from IP: ' + req.ip);
      return res.status(400).json({
        success: false,
        message: 'Bot-like activity detected. Please try again.',
      });
    }

    logger.info('reCAPTCHA passed — score: ' + (score || 'v2') + ' IP: ' + req.ip);
    next();

  } catch (error) {
    // If reCAPTCHA service is down, log and continue (fail open in dev, fail closed in prod)
    logger.error('reCAPTCHA service error: ' + error.message);

    if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({
        success: false,
        message: 'Verification service unavailable. Please try again.',
      });
    }

    next();
  }
};

module.exports = { verifyRecaptcha };