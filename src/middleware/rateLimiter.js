const rateLimit = require('express-rate-limit');

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts, try again in 15 minutes' },
});

const postLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many requests, slow down' },
});

// Document requirement: MODULE G — Billing rate limiter
// Prevents subscription abuse and duplicate charges
const billingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 10,                   // Max 10 billing operations per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many billing requests, please try again later' },
});



const moderationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many moderation actions, slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

const flagLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many flags submitted, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { globalLimiter, authLimiter, postLimiter, billingLimiter, moderationLimiter, flagLimiter };