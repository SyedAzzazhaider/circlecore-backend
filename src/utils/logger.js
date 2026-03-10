const winston = require('winston');
const path    = require('path');

/**
 * Winston Logger
 *
 * CC-30 FIX: Log level was hardcoded as 'warn' in production.
 *
 * BEFORE:
 *   level: process.env.NODE_ENV === 'development' ? 'debug' : 'warn'
 *
 * Problem: In production, 'warn' suppresses ALL logger.info() calls.
 * Every startup message, request log, cron fire, socket connection,
 * notification send, and cache hit was completely invisible in production logs.
 * This made debugging production issues effectively impossible.
 *
 * AFTER:
 *   level: process.env.LOG_LEVEL || (development ? 'debug' : 'info')
 *
 * Benefits:
 *   1. Production default is 'info' — all operational events visible
 *   2. LOG_LEVEL env var overrides per-environment without code changes
 *      (e.g. temporarily set LOG_LEVEL=debug on EC2 to debug an issue)
 *   3. 'warn' still available: set LOG_LEVEL=warn if logs are too noisy
 *
 * Add to your .env:
 *   LOG_LEVEL=   ← leave blank for default (info in prod, debug in dev)
 *
 * Add to EC2 .env if you want quieter production logs:
 *   LOG_LEVEL=warn
 */

const levels = {
  error: 0,
  warn:  1,
  info:  2,
  http:  3,
  debug: 4,
};

const colors = {
  error: 'red',
  warn:  'yellow',
  info:  'green',
  http:  'magenta',
  debug: 'white',
};

winston.addColors(colors);

const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}`)
);

const transports = [
  new winston.transports.Console(),
  new winston.transports.File({ filename: path.join('logs', 'error.log'),    level: 'error' }),
  new winston.transports.File({ filename: path.join('logs', 'combined.log') }),
];

// CC-30 FIX: configurable level — LOG_LEVEL env var takes priority
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
  levels,
  format,
  transports,
});

module.exports = logger;
