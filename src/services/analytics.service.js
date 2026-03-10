const logger = require('../utils/logger');

/**
 * Analytics Service — Mixpanel
 * Document requirement: Architecture Overview — Analytics (Mixpanel/Amplitude)
 *
 * Tracks key business events across the platform.
 * Gracefully disabled if MIXPANEL_TOKEN is not set (local dev).
 *
 * Events tracked:
 *   user_signed_up       → auth.service.js register()
 *   user_logged_in       → auth.service.js login()
 *   subscription_started → billing.service.js subscribeWithStripe/Razorpay()
 *   subscription_cancelled → billing.service.js cancelSubscription()
 *   post_created         → post.service.js createPost()
 *   event_rsvp           → event.service.js rsvpEvent()
 *   community_joined     → community.service.js join()
 *
 * Get your token from: https://mixpanel.com → Your Project → Settings → Project Details
 */

class AnalyticsService {

  constructor() {
    this.enabled = false;
    this.client  = null;

    if (!process.env.MIXPANEL_TOKEN) {
      logger.warn('Mixpanel not configured — analytics disabled (set MIXPANEL_TOKEN to enable)');
      return;
    }

    try {
      const Mixpanel  = require('mixpanel');
      this.client     = Mixpanel.init(process.env.MIXPANEL_TOKEN, {
        protocol: 'https',
        keepAlive: true,
      });
      this.enabled = true;
      logger.info('Mixpanel analytics initialized');
    } catch (e) {
      logger.error('Mixpanel init failed: ' + e.message);
    }
  }

  /**
   * Track an event
   * @param {string} event      - Event name e.g. 'user_signed_up'
   * @param {string} distinctId - User ID or anonymous ID
   * @param {object} properties - Extra properties to attach
   */
  track(event, distinctId, properties = {}) {
    if (!this.enabled || !this.client) return;

    try {
      this.client.track(event, {
        distinct_id: distinctId ? distinctId.toString() : 'anonymous',
        environment: process.env.NODE_ENV || 'production',
        ...properties,
      });
    } catch (e) {
      // Analytics must NEVER crash the main application flow
      logger.warn('Mixpanel track failed (non-fatal): ' + e.message);
    }
  }

  /**
   * Set persistent user profile properties
   * Called after signup to store user metadata in Mixpanel People
   * @param {string} userId
   * @param {object} properties
   */
  setUserProfile(userId, properties = {}) {
    if (!this.enabled || !this.client) return;

    try {
      this.client.people.set(userId.toString(), {
        $created:    new Date().toISOString(),
        environment: process.env.NODE_ENV || 'production',
        ...properties,
      });
    } catch (e) {
      logger.warn('Mixpanel people.set failed (non-fatal): ' + e.message);
    }
  }

  // ─── Convenience tracking methods ──────────────────────────────────────────

  userSignedUp(userId, properties = {}) {
    this.track('user_signed_up', userId, properties);
    this.setUserProfile(userId, {
      $email: properties.email,
      $name:  properties.name,
      role:   properties.role || 'member',
      ...properties,
    });
  }

  userLoggedIn(userId, properties = {}) {
    this.track('user_logged_in', userId, properties);
  }

  subscriptionStarted(userId, properties = {}) {
    this.track('subscription_started', userId, properties);
    if (userId) {
      this.client && this.client.people.set(userId.toString(), {
        subscription_tier:    properties.tier,
        subscription_gateway: properties.gateway,
      });
    }
  }

  subscriptionCancelled(userId, properties = {}) {
    this.track('subscription_cancelled', userId, properties);
  }

  postCreated(userId, properties = {}) {
    this.track('post_created', userId, properties);
  }

  eventRsvp(userId, properties = {}) {
    this.track('event_rsvp', userId, properties);
  }

  communityJoined(userId, properties = {}) {
    this.track('community_joined', userId, properties);
  }
}

module.exports = new AnalyticsService();