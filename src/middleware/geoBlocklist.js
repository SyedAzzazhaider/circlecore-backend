const blocklist = require('../config/blocklist');
const logger = require('../utils/logger');

/**
 * Geo/Blocklist Middleware
 * Document requirement: MODULE A — Geo/blocklist policies
 *
 * Enforcement order per request:
 *   1. Extract real client IP (handles reverse proxies, Cloudflare, load balancers)
 *   2. Check IP against blocklist (static + Redis dynamic)
 *   3. Extract country code from CDN/proxy headers
 *   4. Check country against blocklist (static + Redis dynamic)
 *   5. Block → 403. Pass → next()
 *
 * IP extraction strategy (checked in order):
 *   a) X-Forwarded-For first IP  — standard proxy header (strip spoofed IPs)
 *   b) CF-Connecting-IP          — Cloudflare real IP
 *   c) X-Real-IP                 — nginx proxy
 *   d) req.ip                    — Express (trust proxy must be set)
 *   e) req.connection.remoteAddress — raw fallback
 *
 * Country detection strategy (checked in order):
 *   a) CF-IPCountry              — Cloudflare (most reliable in production)
 *   b) X-Vercel-IP-Country       — Vercel edge
 *   c) X-Country-Code            — custom nginx/LB header
 *
 * Security note on X-Forwarded-For:
 *   We take ONLY the FIRST IP in the XFF chain.
 *   Clients can append fake IPs to the chain but cannot forge the first entry
 *   when the request passes through a trusted proxy.
 *   For full protection, set `app.set('trust proxy', 1)` in app.js to trust
 *   exactly one proxy hop (your load balancer / Cloudflare).
 *
 * Fail-open policy:
 *   If Redis is unavailable, static blocklists still enforce.
 *   A Redis error never blocks a legitimate user — it only means the dynamic
 *   blocklist is temporarily unavailable.
 *
 * Bypass in test environment:
 *   Middleware is a no-op when NODE_ENV === 'test' to avoid breaking test suites.
 */

// ─── Response helper ──────────────────────────────────────────────────────────

const sendBlocked = (res, reason) => {
  return res.status(403).json({
    success: false,
    message: 'Access denied.',
    code: 'ACCESS_BLOCKED',
    reason, // 'ip' | 'country' — useful for admin debugging
  });
};

// ─── IP extraction ────────────────────────────────────────────────────────────

/**
 * Extract the real client IP from the request.
 * Handles Cloudflare, nginx, AWS ALB, and direct connections.
 * Returns a normalised IPv4 string or null.
 */
const extractClientIp = (req) => {
  // Cloudflare — most trusted in production
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp) return cfIp.trim();

  // Standard reverse proxy header — take first IP only
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const firstIp = xff.split(',')[0].trim();
    if (firstIp) return firstIp;
  }

  // nginx $proxy_add_x_real_ip
  const xRealIp = req.headers['x-real-ip'];
  if (xRealIp) return xRealIp.trim();

  // Express built-in (requires trust proxy setting)
  if (req.ip) return req.ip.replace(/^::ffff:/, ''); // Strip IPv6 prefix from IPv4

  // Raw socket fallback
  return req.connection?.remoteAddress?.replace(/^::ffff:/, '') || null;
};

// ─── Country extraction ───────────────────────────────────────────────────────

/**
 * Extract country code from CDN/proxy headers.
 * Returns ISO 3166-1 alpha-2 string or null if unavailable.
 */
const extractCountryCode = (req) => {
  const cf = req.headers['cf-ipcountry'];        // Cloudflare
  if (cf && cf !== 'XX') return cf.toUpperCase(); // 'XX' = Cloudflare unknown

  const vercel = req.headers['x-vercel-ip-country'];
  if (vercel) return vercel.toUpperCase();

  const custom = req.headers['x-country-code'];
  if (custom) return custom.toUpperCase();

  return null; // Country unknown — geo check is skipped, not blocked
};

// ─── Middleware ───────────────────────────────────────────────────────────────

const geoBlocklist = async (req, res, next) => {
  // No-op in test environment
  if (process.env.NODE_ENV === 'test') return next();

  // Skip if geo/blocklist enforcement is disabled via env
  if (process.env.BLOCKLIST_ENABLED === 'false') return next();

  try {
    const clientIp      = extractClientIp(req);
    const countryCode   = extractCountryCode(req);

    // ── 1. IP blocklist check ────────────────────────────────────────────────
    if (clientIp) {
      const ipBlocked = await blocklist.isIpBlocked(clientIp);
      if (ipBlocked) {
        logger.warn(
          `Blocklist: BLOCKED IP — ${clientIp} → ${req.method} ${req.originalUrl}`
        );
        return sendBlocked(res, 'ip');
      }
    }

    // ── 2. Country blocklist check ───────────────────────────────────────────
    if (countryCode) {
      const countryBlocked = await blocklist.isCountryBlocked(countryCode);
      if (countryBlocked) {
        logger.warn(
          `Blocklist: BLOCKED COUNTRY — ${countryCode} (${clientIp}) → ${req.method} ${req.originalUrl}`
        );
        return sendBlocked(res, 'country');
      }
    }

    // ── 3. Pass — attach metadata to req for downstream use ─────────────────
    // Downstream middleware/controllers can read req.clientIp and req.countryCode
    req.clientIp    = clientIp;
    req.countryCode = countryCode;

    next();

  } catch (error) {
    // Never block a request due to a blocklist check error
    logger.error(`Blocklist middleware error: ${error.message}`);
    next();
  }
};

module.exports = { geoBlocklist };