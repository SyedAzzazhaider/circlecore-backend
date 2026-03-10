const crypto    = require('crypto');
const { authenticator } = require('otplib');
const QRCode    = require('qrcode');
const bcrypt    = require('bcryptjs');
const User      = require('./auth.model');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyTwoFactorTempToken,
} = require('../../utils/jwt');
const logger = require('../../utils/logger');

/**
 * TwoFactorService — MODULE A
 * Document requirement: Two-Factor Auth (optional)
 *
 * CC-10 FIX: Replaced speakeasy (zero commits since 2016, known open CVEs,
 *   deprecated by the Node security community) with otplib — the industry-standard
 *   replacement. Actively maintained, RFC 6238 compliant, identical API contract.
 *
 * Migration impact: ZERO — both libraries use the same TOTP algorithm (RFC 6238)
 *   and base32 secret format. Existing secrets stored in MongoDB remain valid.
 *   Users do NOT need to re-set up their authenticator apps.
 *
 * otplib configuration:
 *   window: 1  → accepts codes from ±1 time step (±30 seconds) to handle clock drift.
 *              This is standard and matches Google Authenticator's tolerance.
 */

// Configure authenticator tolerance for clock drift — must be set before any usage
authenticator.options = { window: 1 };

const APP_NAME          = 'CircleCore';
const BACKUP_CODE_COUNT  = 8;
const BACKUP_CODE_LENGTH = 10;
const BCRYPT_ROUNDS      = 10;

class TwoFactorService {

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. SETUP — generate secret + QR code URI
  //    2FA is NOT active yet — twoFactorEnabled stays false until enable() is called.
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

    // CC-10 FIX: otplib generates a cryptographically secure base32 secret
    // (uses crypto.randomBytes internally — identical security to speakeasy)
    const secret    = authenticator.generateSecret();
    const otpauth   = authenticator.keyuri(user.email, APP_NAME, secret);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauth);

    // Persist secret — twoFactorEnabled stays false until confirmed
    await User.findByIdAndUpdate(userId, { twoFactorSecret: secret });

    logger.info('2FA setup initiated for user: ' + user.email);

    return {
      secret:  secret,       // For manual entry in authenticator app
      qrCode:  qrCodeDataUrl, // Base64 PNG — frontend renders as <img src="...">
      message: 'Scan the QR code with your authenticator app, then call the enable endpoint with your first code to activate.',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. ENABLE — confirm setup + generate backup codes
  //    Activates 2FA and returns 8 plaintext backup codes (shown ONCE only).
  // ─────────────────────────────────────────────────────────────────────────────
  async enableTwoFactor(userId, totpCode) {
    const user = await User.findById(userId).select(
      '+twoFactorEnabled +twoFactorSecret +twoFactorBackupCodes'
    );
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

    if (user.twoFactorEnabled) {
      throw Object.assign(new Error('Two-factor authentication is already enabled.'), { statusCode: 409 });
    }

    if (!user.twoFactorSecret) {
      throw Object.assign(
        new Error('2FA setup not initiated. Call /2fa/setup first.'),
        { statusCode: 400 }
      );
    }

    // CC-10 FIX: authenticator.check() replaces speakeasy.totp.verify()
    // window:1 (set globally above) accepts ±30s clock drift — standard tolerance
    const isValid = authenticator.check(totpCode.toString().trim(), user.twoFactorSecret);

    if (!isValid) {
      throw Object.assign(
        new Error('Invalid verification code. Please check your authenticator app and try again.'),
        { statusCode: 400 }
      );
    }

    const plaintextCodes = this._generateBackupCodes();
    const hashedCodes    = await Promise.all(
      plaintextCodes.map(code => bcrypt.hash(code, BCRYPT_ROUNDS))
    );

    await User.findByIdAndUpdate(userId, {
      twoFactorEnabled:     true,
      twoFactorBackupCodes: hashedCodes,
    });

    logger.info('2FA successfully enabled for user: ' + user.email);

    return {
      message:     'Two-factor authentication has been enabled.',
      backupCodes: plaintextCodes,
      warning:     'Save these backup codes in a secure location. They will not be shown again. Each code can only be used once.',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. VERIFY LOGIN — complete login after 2FA gate
  //    Called with short-lived twoFactorTempToken + TOTP code (or backup code).
  //    On success: issues full access + refresh token pair.
  // ─────────────────────────────────────────────────────────────────────────────
  async verifyLoginToken(twoFactorTempToken, totpCode) {
    if (!twoFactorTempToken) {
      throw Object.assign(new Error('2FA session token is required.'), { statusCode: 400 });
    }
    if (!totpCode) {
      throw Object.assign(new Error('Verification code is required.'), { statusCode: 400 });
    }

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

    // CC-10 FIX: authenticator.check() replaces speakeasy.totp.verify()
    const isTotpValid = authenticator.check(codeStr, user.twoFactorSecret);

    if (!isTotpValid) {
      // Fall back to backup codes
      const backupCodeUsed = await this._consumeBackupCode(user, codeStr);
      if (!backupCodeUsed) {
        throw Object.assign(
          new Error('Invalid verification code. Check your authenticator app or use a backup code.'),
          { statusCode: 401 }
        );
      }
      logger.info('Backup code used for 2FA login — user: ' + user.email);
    }

    const payload      = { userId: user._id, role: user.role, email: user.email };
    const accessToken  = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    const tokens = user.refreshTokens || [];
    tokens.push(refreshToken);
    if (tokens.length > 5) tokens.shift();

    await User.findByIdAndUpdate(user._id, {
      refreshTokens: tokens,
      lastLogin:     new Date(),
    });

    logger.info('2FA login successful for user: ' + user.email);

    return {
      accessToken,
      refreshToken,
      user: {
        _id:       user._id,
        name:      user.name,
        email:     user.email,
        role:      user.role,
        profileId: user.profileId,
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. DISABLE — turn off 2FA entirely
  //    Requires password + valid TOTP code for double confirmation.
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

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      throw Object.assign(new Error('Incorrect password.'), { statusCode: 401 });
    }

    // CC-10 FIX: authenticator.check() replaces speakeasy.totp.verify()
    const isTotpValid = authenticator.check(totpCode.toString().trim(), user.twoFactorSecret);
    if (!isTotpValid) {
      throw Object.assign(new Error('Invalid verification code.'), { statusCode: 401 });
    }

    await User.findByIdAndUpdate(userId, {
      twoFactorEnabled:     false,
      twoFactorSecret:      null,
      twoFactorBackupCodes: [],
    });

    logger.info('2FA disabled for user: ' + user.email);
    return { message: 'Two-factor authentication has been disabled.' };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  _generateBackupCodes() {
    // Excludes O, 0, I, 1 — visually ambiguous characters
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const codes = [];

    for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
      let code  = '';
      const bytes = crypto.randomBytes(BACKUP_CODE_LENGTH);
      for (let j = 0; j < BACKUP_CODE_LENGTH; j++) {
        code += chars[bytes[j] % chars.length];
      }
      codes.push(code.slice(0, 5) + '-' + code.slice(5));
    }

    return codes;
  }

  async _consumeBackupCode(user, rawCode) {
    const normalised = rawCode.replace(/-/g, '').toUpperCase();

    for (let i = 0; i < user.twoFactorBackupCodes.length; i++) {
      const match = await bcrypt.compare(normalised, user.twoFactorBackupCodes[i]);
      if (match) {
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
