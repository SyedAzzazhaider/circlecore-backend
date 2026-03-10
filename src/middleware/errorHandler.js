const logger = require('../utils/logger');

/**
 * Global Error Handler
 *
 * CC-13 FIX: Sentry error reporting integrated.
 * Previously all unhandled exceptions wrote only to a local Winston log file
 * that no one was actively monitoring. Production errors were invisible.
 *
 * Now: every 5xx error is captured in Sentry with full context —
 * stack trace, user ID, request URL, method, and environment.
 *
 * Sentry is loaded lazily — if SENTRY_DSN is not configured the handler
 * still works normally (graceful no-op). This prevents Sentry misconfiguration
 * from breaking the error handler itself.
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message    = err.message    || 'Internal Server Error';

  // ─── Known error type normalization ─────────────────────────────────────────
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'Field';
    message = field.charAt(0).toUpperCase() + field.slice(1) + ' already exists';
  }
  if (err.name === 'ValidationError') {
    statusCode = 422;
    message = Object.values(err.errors).map(e => e.message).join(', ');
  }
  if (err.name === 'JsonWebTokenError')  { statusCode = 401; message = 'Invalid token'; }
  if (err.name === 'TokenExpiredError')  { statusCode = 401; message = 'Token expired'; }
  if (err.name === 'CastError')          { statusCode = 400; message = 'Invalid ID format'; }

  logger.error(statusCode + ' - ' + message + ' - ' + req.originalUrl + ' - ' + req.method);

  // CC-13 FIX: Capture 5xx errors in Sentry with user + request context
  // Only report server errors — 4xx errors are user mistakes, not bugs
  if (statusCode >= 500 && process.env.SENTRY_DSN) {
    try {
      const Sentry = require('@sentry/node');
      Sentry.withScope((scope) => {
        // Attach user identity if available
        if (req.user) {
          scope.setUser({
            id:    req.user._id ? req.user._id.toString() : 'unknown',
            email: req.user.email || 'unknown',
            role:  req.user.role  || 'unknown',
          });
        }
        // Attach request context
        scope.setTag('method',      req.method);
        scope.setTag('url',         req.originalUrl);
        scope.setTag('status_code', statusCode);
        scope.setExtra('request_body',    req.method !== 'GET' ? req.body : undefined);
        scope.setExtra('request_params',  req.params);
        scope.setExtra('request_query',   req.query);
        Sentry.captureException(err);
      });
    } catch (sentryErr) {
      // Never let Sentry failure break the error response
      logger.warn('Sentry capture failed: ' + sentryErr.message);
    }
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
