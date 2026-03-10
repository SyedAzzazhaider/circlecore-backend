const { verifyAccessToken } = require('../utils/jwt');
const User        = require('../modules/auth/auth.model');
const ApiResponse = require('../utils/apiResponse');
const logger      = require('../utils/logger');

/**
 * Authentication Middleware
 *
 * CC-20 FIX: Dead cookie fallback removed.
 *
 * The original code had:
 *   } else if (req.cookies?.accessToken) {
 *     token = req.cookies.accessToken;
 *   }
 *
 * This branch was permanently unreachable because:
 *   - The login() controller ONLY returns accessToken in the JSON response body
 *   - No controller ever calls res.cookie('accessToken', ...)
 *   - The frontend stores the token in memory/localStorage, not as a cookie
 *
 * Leaving dead branches in auth middleware is dangerous — it documents
 * a non-existent auth contract that could confuse future developers into
 * thinking cookie auth is supported, or worse, accidentally re-enabling it
 * without the csrf protection that cookie auth requires.
 *
 * After fix: token extraction is a single, clear, unambiguous path.
 * Only Bearer token in Authorization header is accepted.
 */
const authenticate = async (req, res, next) => {
  try {
    // CC-20 FIX: Single token extraction — Bearer header only.
    // Cookie fallback removed (was dead code — login() never sets accessToken cookie).
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) return ApiResponse.unauthorized(res, 'Access token required');

    const decoded = verifyAccessToken(token);
    const user    = await User.findById(decoded.userId).select('-password -refreshTokens');

    if (!user)                return ApiResponse.unauthorized(res, 'User not found');
    if (!user.isEmailVerified) return ApiResponse.unauthorized(res, 'Please verify your email first');
    if (user.isSuspended)     return ApiResponse.forbidden(res, 'Account suspended. Contact support.');

    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication error: ' + error.message);
    return ApiResponse.unauthorized(res, error.message || 'Authentication failed');
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return ApiResponse.forbidden(res, 'You do not have permission to perform this action');
    }
    next();
  };
};

module.exports = { authenticate, authorize };
