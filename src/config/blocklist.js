/**
 * Blocklist Configuration
 * Document requirement: MODULE A — Geo/blocklist policies
 *
 * Two policy layers:
 *   1. IP Blocklist   — explicit IP addresses blocked permanently
 *   2. Country Block  — ISO 3166-1 alpha-2 country codes denied access
 *
 * Sources of truth (checked in this order):
 *   a) BLOCKED_IPS env var         — comma-separated static IP list
 *   b) BLOCKED_COUNTRIES env var   — comma-separated country codes
 *   c) Redis dynamic blocklist     — runtime additions by admin (survives restarts)
 *   d) Hardcoded defaults below    — baseline config (empty by default)
 *
 * Country detection headers (checked in priority order):
 *   1. CF-IPCountry     — Cloudflare (production CDN)
 *   2. X-Country-Code   — custom header set by your load balancer / nginx
 *   3. X-Vercel-IP-Country — Vercel edge
 *
 * Redis key schema:
 *   blocklist:ip:<ip_address>       → '1'  (blocked IP)
 *   blocklist:country:<CC>          → '1'  (blocked country)
 *
 * Management:
 *   Admins can call BlocklistConfig.blockIp() / .unblockIp() at runtime.
 *   Changes are written to Redis and take effect immediately — no restart needed.
 */

const logger = require('../utils/logger');

// ─── Static defaults (extend via env vars) ────────────────────────────────────

/**
 * Hardcoded base IP blocklist.
 * Add known malicious IPs here as a baseline.
 * Primary blocklist is managed via BLOCKED_IPS env var and Redis.
 */
const DEFAULT_BLOCKED_IPS = new Set([
  // Example: '192.168.1.100',
]);

/**
 * Hardcoded base country blocklist.
 * Use ISO 3166-1 alpha-2 codes.
 * Primary list is managed via BLOCKED_COUNTRIES env var.
 *
 * Leave empty by default — platform owner configures via env.
 */
const DEFAULT_BLOCKED_COUNTRIES = new Set([
  // Example: 'XX', 'YY',
]);

// ─── Load from environment variables ─────────────────────────────────────────

const envBlockedIps = process.env.BLOCKED_IPS
  ? new Set(process.env.BLOCKED_IPS.split(',').map(ip => ip.trim()).filter(Boolean))
  : new Set();

const envBlockedCountries = process.env.BLOCKED_COUNTRIES
  ? new Set(process.env.BLOCKED_COUNTRIES.split(',').map(cc => cc.trim().toUpperCase()).filter(Boolean))
  : new Set();

// Merged static blocklists (defaults + env)
const STATIC_BLOCKED_IPS = new Set([...DEFAULT_BLOCKED_IPS, ...envBlockedIps]);
const STATIC_BLOCKED_COUNTRIES = new Set([...DEFAULT_BLOCKED_COUNTRIES, ...envBlockedCountries]);

if (STATIC_BLOCKED_IPS.size > 0) {
  logger.info(`Blocklist: ${STATIC_BLOCKED_IPS.size} IP(s) blocked via static config`);
}
if (STATIC_BLOCKED_COUNTRIES.size > 0) {
  logger.info(`Blocklist: ${STATIC_BLOCKED_COUNTRIES.size} country/countries blocked via static config: ${[...STATIC_BLOCKED_COUNTRIES].join(', ')}`);
}

// ─── Redis keys ───────────────────────────────────────────────────────────────
const REDIS_IP_PREFIX      = 'blocklist:ip:';
const REDIS_COUNTRY_PREFIX = 'blocklist:country:';

// ─── BlocklistConfig class ────────────────────────────────────────────────────

class BlocklistConfig {

  constructor() {
    this._redis = null; // Lazily injected — avoids circular dependency with redis.js
  }

  /**
   * Inject the Redis client after app initialisation.
   * Called once from app.js after Redis is connected.
   * @param {object} redisClient - ioredis or node-redis client
   */
  setRedis(redisClient) {
    this._redis = redisClient;
    logger.info('Blocklist: Redis client connected for dynamic blocklist');
  }

  // ─── IP Blocklist ───────────────────────────────────────────────────────────

  /**
   * Check if an IP address is blocked.
   * Checks static list first (O(1)), then Redis (async).
   * @param {string} ip
   * @returns {Promise<boolean>}
   */
  async isIpBlocked(ip) {
    if (!ip) return false;

    // 1. Static check (fast path — no I/O)
    if (STATIC_BLOCKED_IPS.has(ip)) return true;

    // 2. Redis dynamic check
    if (this._redis) {
      try {
        const result = await this._redis.get(REDIS_IP_PREFIX + ip);
        return result === '1';
      } catch (err) {
        logger.warn(`Blocklist: Redis IP check failed for ${ip} — ${err.message}`);
        return false; // Fail open — don't block on Redis error
      }
    }

    return false;
  }

  /**
   * Check if a country code is blocked.
   * @param {string} countryCode - ISO 3166-1 alpha-2 (e.g. 'US', 'CN')
   * @returns {Promise<boolean>}
   */
  async isCountryBlocked(countryCode) {
    if (!countryCode) return false;

    const cc = countryCode.toUpperCase();

    // 1. Static check
    if (STATIC_BLOCKED_COUNTRIES.has(cc)) return true;

    // 2. Redis dynamic check
    if (this._redis) {
      try {
        const result = await this._redis.get(REDIS_COUNTRY_PREFIX + cc);
        return result === '1';
      } catch (err) {
        logger.warn(`Blocklist: Redis country check failed for ${cc} — ${err.message}`);
        return false;
      }
    }

    return false;
  }

  // ─── Runtime management (admin operations) ──────────────────────────────────

  /**
   * Block an IP address at runtime.
   * Persisted to Redis — survives restarts.
   * @param {string} ip
   * @param {number} ttlSeconds - optional TTL (0 = permanent)
   */
  async blockIp(ip, ttlSeconds = 0) {
    if (!this._redis) throw new Error('Redis not configured');
    const key = REDIS_IP_PREFIX + ip;
    if (ttlSeconds > 0) {
      await this._redis.set(key, '1', 'EX', ttlSeconds);
    } else {
      await this._redis.set(key, '1');
    }
    logger.warn(`Blocklist: IP ${ip} blocked dynamically (TTL: ${ttlSeconds || 'permanent'})`);
  }

  /**
   * Unblock an IP address at runtime.
   * @param {string} ip
   */
  async unblockIp(ip) {
    if (!this._redis) throw new Error('Redis not configured');
    await this._redis.del(REDIS_IP_PREFIX + ip);
    logger.info(`Blocklist: IP ${ip} unblocked`);
  }

  /**
   * Block a country at runtime.
   * @param {string} countryCode
   */
  async blockCountry(countryCode) {
    if (!this._redis) throw new Error('Redis not configured');
    const cc = countryCode.toUpperCase();
    await this._redis.set(REDIS_COUNTRY_PREFIX + cc, '1');
    logger.warn(`Blocklist: Country ${cc} blocked dynamically`);
  }

  /**
   * Unblock a country at runtime.
   * @param {string} countryCode
   */
  async unblockCountry(countryCode) {
    if (!this._redis) throw new Error('Redis not configured');
    const cc = countryCode.toUpperCase();
    await this._redis.del(REDIS_COUNTRY_PREFIX + cc);
    logger.info(`Blocklist: Country ${cc} unblocked`);
  }
}

module.exports = new BlocklistConfig();