const crypto = require('crypto');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');
const User = require('./auth.model');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyTwoFactorTempToken,
} = require('../../utils/jwt');
const logger = require('../../utils/logger');

/**
 * TwoFactorService
 * Document requirement: MODULE A — Two-Factor Auth (optional)
 *
 * TOTP standard: RFC 6238 (Time-based One-Time Password)
 * Compatible with: Google Authenticator, Authy, Microsoft Authenticator, 1Password
 *
 * Full flow:
 *   1. setupTwoFactor()     → generates secret + QR code, stores secret (NOT yet enabled)
 *   2. enableTwoFactor()    → user confirms with first TOTP code → enables + issues backup codes
 *   3. verifyLoginToken()   → validates twoFactorTempToken + TOTP code → issues full JWT pair
 *   4. disableTwoFactor()   → requires password + valid TOTP code → clears all 2FA fields
 *
 * Backup codes:
 *   - 8 codes, 10 uppercase alphanumeric chars each
 *   - Stored as individual bcrypt hashes (cost 10)
 *   - Each code is single-use — removed from array after successful use
 *   - Returned in plaintext ONCE at enable time — never retrievable again
 */

// otplib configuration — industry standard settings
authenticator.options = {
  window: 1,      // Accept 1 step tolerance (±30s) to handle clock drift
  step: 30,       // 30-second TOTP window (RFC 6238 standard)
  digits: 6,      // 6-digit codes
};

const APP_NAME = 'CircleCore';
const BACKUP_CODE_COUNT = 8;
const BACKUP_CODE_LENGTH = 10;
const BCRYPT_ROUNDS = 10;

class TwoFactorService {

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. SETUP — generate secret + QR code URI
  //    Called when user initiates 2FA setup from their security settings.
  //    Stores the secret immediately so it survives between setup and enable steps.
  //    2FA is NOT active yet — twoFactorEnabled remains false.
  // ─────────────────────────────────────────────────────────────────────────────
  async setupTwoFactor(userId) {
    const user = await User.findById(userId).select('+twoFactorEnabled +twoFactorSecret');
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

    if (user.twoFactorEnabled) {
      throw Object.assign(
        new Error('Two-factor authentication is already enabled on this account.'),
        { statusCode: 409 }
      );
    }

    // Generate a cryptographically secure TOTP secret
    const secret = authenticator.generateSecret(32); // 32 bytes → 52-char base32 string

    // Build the otpauth URI — this is what authenticator apps scan
    const otpauthUri = authenticator.keyuri(user.email, APP_NAME, secret);

    // Generate QR code as a base64 data URL — returned to frontend for display
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri);

    // Persist secret (not yet active — twoFactorEnabled stays false)
    await User.findByIdAndUpdate(userId, { twoFactorSecret: secret });

    logger.info(`2FA setup initiated for user: ${user.email}`);

    return {
      secret,        // For users who prefer manual entry in their authenticator app
      qrCode: qrCodeDataUrl,  // Base64 PNG — frontend renders as <img src="...">
      message: 'Scan the QR code with your authenticator app, then call the enable endpoint with your first code to activate.',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. ENABLE — confirm setup with first TOTP code + generate backup codes
  //    Called after user has scanned the QR code and entered their first code.
  //    Activates 2FA and returns 8 plaintext backup codes (shown ONCE only).
  // ─────────────────────────────────────────────────────────────────────────────
  async enableTwoFactor(userId, totpCode) {
    const user = await User.findById(userId).select(
      '+twoFactorEnabled +twoFactorSecret +twoFactorBackupCodes'
    );
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

    if (user.twoFactorEnabled) {
      throw Object.assign(
        new Error('Two-factor authentication is already enabled.'),
        { statusCode: 409 }
      );
    }

    if (!user.twoFactorSecret) {
      throw Object.assign(
        new Error('2FA setup not initiated. Call /2fa/setup first.'),
        { statusCode: 400 }
      );
    }

    // Verify the TOTP code against the stored secret
    const isValid = authenticator.verify({
      token: totpCode.toString().trim(),
      secret: user.twoFactorSecret,
    });

    if (!isValid) {
      throw Object.assign(
        new Error('Invalid verification code. Please check your authenticator app and try again.'),
        { statusCode: 400 }
      );
    }

    // Generate 8 plaintext backup codes
    const plaintextCodes = this._generateBackupCodes();

    // Hash each backup code before storing — same pattern as passwords
    const hashedCodes = await Promise.all(
      plaintextCodes.map(code => bcrypt.hash(code, BCRYPT_ROUNDS))
    );

    // Enable 2FA and store hashed backup codes
    await User.findByIdAndUpdate(userId, {
      twoFactorEnabled: true,
      twoFactorBackupCodes: hashedCodes,
    });

    logger.info(`2FA successfully enabled for user: ${user.email}`);

    return {
      message: 'Two-factor authentication has been enabled.',
      backupCodes: plaintextCodes, // ⚠️ Shown ONCE — user must save these immediately
      warning: 'Save these backup codes in a secure location. They will not be shown again. Each code can only be used once.',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. VERIFY LOGIN — complete login after password step
  //    Called with the short-lived twoFactorTempToken + user's TOTP code (or backup code).
  //    On success: issues full access + refresh token pair (identical to standard login).
  // ─────────────────────────────────────────────────────────────────────────────
  async verifyLoginToken(twoFactorTempToken, totpCode) {
    if (!twoFactorTempToken) {
      throw Object.assign(new Error('2FA session token is required.'), { statusCode: 400 });
    }
    if (!totpCode) {
      throw Object.assign(new Error('Verification code is required.'), { statusCode: 400 });
    }

    // Verify the temp token — throws if expired or tampered
    let decoded;
    try {
      decoded = verifyTwoFactorTempToken(twoFactorTempToken);
    } catch (e) {
      throw Object.assign(
        new Error('2FA session expired or invalid. Please log in again.'),
        { statusCode: 401 }
      );
    }

    const user = await User.findById(decoded.userId).select(
      '+twoFactorEnabled +twoFactorSecret +twoFactorBackupCodes +refreshTokens'
    );

    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 401 });

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw Object.assign(
        new Error('Two-factor authentication is not enabled on this account.'),
        { statusCode: 400 }
      );
    }

    const codeStr = totpCode.toString().trim();

    // ── Try TOTP code first ────────────────────────────────────────────────────
    const isTotpValid = authenticator.verify({
      token: codeStr,
      secret: user.twoFactorSecret,
    });

    if (!isTotpValid) {
      // ── Try backup codes ───────────────────────────────────────────────────
      const backupCodeUsed = await this._consumeBackupCode(user, codeStr);

      if (!backupCodeUsed) {
        throw Object.assign(
          new Error('Invalid verification code. Check your authenticator app or use a backup code.'),
          { statusCode: 401 }
        );
      }
      logger.info(`Backup code used for 2FA login — user: ${user.email}`);
    }

    // ── Issue full token pair (mirrors standard login) ─────────────────────────
    const payload = { userId: user._id, role: user.role, email: user.email };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    const tokens = user.refreshTokens || [];
    tokens.push(refreshToken);
    if (tokens.length > 5) tokens.shift();

    await User.findByIdAndUpdate(user._id, {
      refreshTokens: tokens,
      lastLogin: new Date(),
    });

    logger.info(`2FA login successful for user: ${user.email}`);

    return {
      accessToken,
      refreshToken,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profileId: user.profileId,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. DISABLE — turn off 2FA entirely
  //    Requires both the user's password AND a valid TOTP code for double confirmation.
  //    Clears secret + backup codes from the database.
  // ─────────────────────────────────────────────────────────────────────────────
  async disableTwoFactor(userId, password, totpCode) {
    const user = await User.findById(userId).select(
      '+password +twoFactorEnabled +twoFactorSecret +twoFactorBackupCodes'
    );
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

    if (!user.twoFactorEnabled) {
      throw Object.assign(
        new Error('Two-factor authentication is not enabled on this account.'),
        { statusCode: 400 }
      );
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      throw Object.assign(
        new Error('Incorrect password.'),
        { statusCode: 401 }
      );
    }

    // Verify TOTP code
    const isTotpValid = authenticator.verify({
      token: totpCode.toString().trim(),
      secret: user.twoFactorSecret,
    });

    if (!isTotpValid) {
      throw Object.assign(
        new Error('Invalid verification code.'),
        { statusCode: 401 }
      );
    }

    // Clear all 2FA data
    await User.findByIdAndUpdate(userId, {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorBackupCodes: [],
    });

    logger.info(`2FA disabled for user: ${user.email}`);

    return { message: 'Two-factor authentication has been disabled.' };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Generate N plaintext backup codes.
   * Format: XXXX-XXXXX (10 uppercase alphanumeric characters, hyphenated for readability)
   */
  _generateBackupCodes() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Remove O,0,I,1 — visually ambiguous
    const codes = [];

    for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
      let code = '';
      const bytes = crypto.randomBytes(BACKUP_CODE_LENGTH);
      for (let j = 0; j < BACKUP_CODE_LENGTH; j++) {
        code += chars[bytes[j] % chars.length];
      }
      // Format as XXXXX-XXXXX for readability
      codes.push(code.slice(0, 5) + '-' + code.slice(5));
    }

    return codes;
  }

  /**
   * Check a submitted code against all stored backup code hashes.
   * If found: remove it from the array (single-use), save, return true.
   * If not found: return false.
   *
   * Normalise input: strip hyphens and uppercase before comparing.
   */
  async _consumeBackupCode(user, rawCode) {
    const normalised = rawCode.replace(/-/g, '').toUpperCase();

    for (let i = 0; i < user.twoFactorBackupCodes.length; i++) {
      const match = await bcrypt.compare(normalised, user.twoFactorBackupCodes[i]);
      if (match) {
        // Remove this code so it cannot be reused
        user.twoFactorBackupCodes.splice(i, 1);
        await User.findByIdAndUpdate(user._id, {
          twoFactorBackupCodes: user.twoFactorBackupCodes,
        });
        return true;
      }
    }
    return false;
  }
}

module.exports = new TwoFactorService();