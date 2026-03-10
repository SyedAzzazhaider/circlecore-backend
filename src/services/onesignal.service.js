const logger = require('../utils/logger');

/**
 * OneSignal Push Notification Service
 * Document requirement: MODULE F — Push Notifications via OneSignal
 *
 * Sends push notifications to users who have registered a device token.
 * Falls back gracefully if OneSignal is not configured.
 *
 * Required env vars:
 *   ONESIGNAL_APP_ID   → from OneSignal dashboard → Settings → Keys & IDs
 *   ONESIGNAL_API_KEY  → REST API Key from same page
 *
 * NOTE ON API KEY:
 *   Use the APP-level REST API Key (Settings → Keys & IDs → REST API Key).
 *   If you only have the Organization key (starts with os_v2_org_), go to:
 *   Settings → Keys & IDs → scroll down to "REST API Key" section.
 *   The org key may also work — OneSignal accepts both for notification delivery.
 */
class OneSignalService {

  constructor() {
    this.appId   = process.env.ONESIGNAL_APP_ID;
    this.apiKey  = process.env.ONESIGNAL_API_KEY;
    this.enabled = !!(this.appId && this.apiKey);

    if (!this.enabled) {
      logger.warn('OneSignal not configured — push notifications disabled');
    } else {
      logger.info('OneSignal push notifications enabled — App ID: ' + this.appId.slice(0, 8) + '...');
    }
  }

  /**
   * Send a push notification to a single user by their OneSignal subscription ID
   * @param {string} deviceToken - OneSignal subscription/player ID stored on User model
   * @param {string} title       - Notification title (shown in browser/mobile)
   * @param {string} body        - Notification body text
   * @param {object} data        - Extra data payload (notificationId, type, deep link, etc.)
   */
  async sendToUser(deviceToken, title, body, data = {}) {
    if (!this.enabled || !deviceToken) return;

    try {
      const response = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Basic ' + this.apiKey,
        },
        body: JSON.stringify({
          app_id:             this.appId,
          include_player_ids: [deviceToken],
          headings:           { en: title },
          contents:           { en: body },
          data,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        logger.error('OneSignal push failed: ' + JSON.stringify(result.errors || result));
      } else {
        logger.info('OneSignal push sent to: ' + deviceToken.slice(0, 8) + '...');
      }
    } catch (error) {
      // Never crash the notification flow if OneSignal is unreachable
      logger.error('OneSignal request failed: ' + error.message);
    }
  }

  /**
   * Send push notification to multiple users at once (batch)
   * @param {string[]} deviceTokens - Array of OneSignal subscription IDs
   * @param {string}   title
   * @param {string}   body
   * @param {object}   data
   */
  async sendToUsers(deviceTokens, title, body, data = {}) {
    if (!this.enabled || !deviceTokens?.length) return;

    const validTokens = deviceTokens.filter(Boolean);
    if (!validTokens.length) return;

    try {
      const response = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Basic ' + this.apiKey,
        },
        body: JSON.stringify({
          app_id:             this.appId,
          include_player_ids: validTokens,
          headings:           { en: title },
          contents:           { en: body },
          data,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        logger.error('OneSignal batch push failed: ' + JSON.stringify(result.errors || result));
      } else {
        logger.info('OneSignal batch push sent to ' + validTokens.length + ' users');
      }
    } catch (error) {
      logger.error('OneSignal batch request failed: ' + error.message);
    }
  }
}

module.exports = new OneSignalService();
