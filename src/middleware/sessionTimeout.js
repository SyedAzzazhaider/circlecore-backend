const User = require('../modules/auth/auth.model');
const logger = require('../utils/logger');

/**
 * Server-side session timeout middleware
 * Document requirement: MODULE A — Session timeout
 * Forces logout if user has been inactive beyond SESSION_TIMEOUT_MINUTES
 */
const SESSION_TIMEOUT_MINUTES = parseInt(process.env.SESSION_TIMEOUT_MINUTES) || 60;

const checkSessionTimeout = async (req, res, next) => {
  try {
    // Only enforce on authenticated requests
    if (!req.user || !req.user._id) {
      return next();
    }

    // Skip timeout check in test environment
    if (process.env.NODE_ENV === 'test') {
      return next();
    }

    const user = await User.findById(req.user._id).select('+lastActivity');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Session expired. Please log in again.',
        code: 'SESSION_EXPIRED',
      });
    }

    const now = new Date();
    const lastActivity = user.lastActivity || user.lastLogin || user.createdAt;
    const timeoutMs = SESSION_TIMEOUT_MINUTES * 60 * 1000;
    const timeSinceActivity = now - new Date(lastActivity);

    if (timeSinceActivity > timeoutMs) {
      logger.warn('Session timeout for user: ' + user.email + ' — inactive for ' + Math.round(timeSinceActivity / 60000) + ' minutes');

      // Revoke all refresh tokens on timeout
      await User.findByIdAndUpdate(req.user._id, {
        refreshTokens: [],
        lastActivity: null,
      });

      return res.status(401).json({
        success: false,
        message: 'Session expired due to inactivity. Please log in again.',
        code: 'SESSION_TIMEOUT',
      });
    }

    // Update lastActivity on every authenticated request
    await User.findByIdAndUpdate(req.user._id, {
      lastActivity: now,
    });

    next();

  } catch (error) {
    logger.error('Session timeout check error: ' + error.message);
    next(); // Fail open — do not block request on error
  }
};

module.exports = { checkSessionTimeout };