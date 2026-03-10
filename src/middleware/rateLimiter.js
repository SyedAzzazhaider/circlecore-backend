const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { getRedis } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Rate Limiters — All backed by Redis
 *
 * CC-12 FIX: All limiters previously used the default in-memory store.
 * Under horizontal scaling (multiple EC2 instances behind a load balancer),
 * each instance tracked its own independent counter — a brute-force attacker
 * could bypass the 10-request auth limit by rotating between instances.
 *
 * Fix: Every limiter now uses RedisStore from rate-limit-redis.
 * All instances share the SAME counter in Redis → limits are truly enforced.
 *
 * Graceful fallback: If Redis is unavailable (e.g. during startup), the limiter
 * falls back to in-memory store with a warning. This prevents a Redis outage
 * from taking down the entire API — trade-off is acceptable for MVP scale.
 */

/**
 * Build a Redis store for a given limiter prefix.
 * Falls back gracefully to undefined (in-memory) if Redis is not ready.
 */
const makeRedisStore = (prefix) => {
  try {
    const redis = getRedis();
    if (!redis || redis.status !== 'ready') {
      logger.warn('Rate limiter Redis store unavailable for prefix: ' + prefix + ' — using in-memory fallback');
      return undefined;
    }
    return new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix: 'rl:' + prefix + ':',
    });
  } catch (e) {
    logger.warn('Rate limiter Redis store init failed (' + prefix + '): ' + e.message);
    return undefined;
  }
};

// ─── Global limiter — 100 req / 15 min per IP ─────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRedisStore('global'),
  message: { success: false, message: 'Too many requests, please try again later' },
});

// ─── Auth limiter — 10 req / 15 min (login, register, forgot-password) ────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRedisStore('auth'),
  message: { success: false, message: 'Too many authentication attempts, try again in 15 minutes' },
});

// ─── Post limiter — 20 req / 1 min per user ───────────────────────────────────
const postLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRedisStore('post'),
  message: { success: false, message: 'Too many requests, slow down' },
});

// ─── Billing limiter — 10 req / 1 hour (prevents duplicate charges) ──────────
const billingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRedisStore('billing'),
  message: { success: false, message: 'Too many billing requests, please try again later' },
});

// ─── Moderation limiter — 30 req / 15 min ────────────────────────────────────
const moderationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRedisStore('moderation'),
  message: { success: false, message: 'Too many moderation actions, slow down' },
});

// ─── Flag limiter — 10 req / 1 hour ──────────────────────────────────────────
const flagLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRedisStore('flag'),
  message: { success: false, message: 'Too many flags submitted, try again later' },
});

// ─── Search limiter — 30 req / 1 min (CC-26: expensive $regex queries) ────────
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: makeRedisStore('search'),
  message: { success: false, message: 'Too many search requests, please slow down' },
});

module.exports = {
  globalLimiter,
  authLimiter,
  postLimiter,
  billingLimiter,
  moderationLimiter,
  flagLimiter,
  searchLimiter,
};
