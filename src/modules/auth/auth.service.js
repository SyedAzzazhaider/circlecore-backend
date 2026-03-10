const User   = require('./auth.model');
const crypto = require('crypto');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../../utils/jwt');
const { generateTwoFactorTempToken } = require('../../utils/jwt');
const logger = require('../../utils/logger');

/**
 * Auth Service
 *
 * CC-05 FIX: logout() now clears deviceToken.
 *
 * Previously logout only pulled the refreshToken from the user's token array.
 * The deviceToken was left in place — meaning after logout, the user's device
 * would still receive push notifications.
 *
 * Fix: add deviceToken: null, devicePlatform: null to the logout update.
 * This ensures the next push notification attempt finds no token and skips
 * the OneSignal call entirely.
 */
class AuthService {

  async login(email, password) {
    const user = await User.findOne({ email: email.toLowerCase() })
      .select('+password +refreshTokens +loginAttempts +lockUntil +twoFactorEnabled');

    if (!user) throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
    if (user.isLocked) throw Object.assign(new Error('Account locked due to too many failed attempts. Try again in 2 hours.'), { statusCode: 423 });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await user.incrementLoginAttempts();
      throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
    }

    if (!user.isEmailVerified) throw Object.assign(new Error('Please verify your email before logging in'), { statusCode: 401 });
    if (user.isSuspended) throw Object.assign(new Error('Account suspended. Contact support.'), { statusCode: 403 });

    // Two-factor auth gate
    if (user.twoFactorEnabled) {
      const twoFactorTempToken = generateTwoFactorTempToken(user._id);
      return { requiresTwoFactor: true, twoFactorTempToken };
    }

    const payload      = { userId: user._id, email: user.email, role: user.role };
    const accessToken  = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    const tokens = user.refreshTokens || [];
    tokens.push(refreshToken);

    await User.findByIdAndUpdate(user._id, {
      refreshTokens: tokens,
      lastLogin:     new Date(),
      loginAttempts: 0,
    });

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

  async refreshToken(token) {
    const decoded = verifyRefreshToken(token);
    const user    = await User.findById(decoded.userId).select('+refreshTokens');

    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 401 });

    const tokenIndex = user.refreshTokens.indexOf(token);
    if (tokenIndex === -1) throw Object.assign(new Error('Invalid refresh token'), { statusCode: 401 });

    const payload         = { userId: user._id, email: user.email, role: user.role };
    const newAccessToken  = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken(payload);

    user.refreshTokens[tokenIndex] = newRefreshToken;
    await user.save();

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(userId, refreshToken) {
    // CC-05 FIX: clear deviceToken on logout so push notifications
    // are not sent to signed-out devices
    await User.findByIdAndUpdate(userId, {
      $pull: { refreshTokens: refreshToken },
      deviceToken:    null,
      devicePlatform: null,
    });

    return { message: 'Logged out successfully' };
  }

  async forgotPassword(email) {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return { message: 'If that email is registered, you will receive a reset link.' };

    const resetToken   = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000);

    await User.findByIdAndUpdate(user._id, {
      passwordResetToken:   resetToken,
      passwordResetExpires: resetExpires,
    });

    const { sendPasswordResetEmail } = require('../../utils/email');
    await sendPasswordResetEmail(user.email, user.name, resetToken);

    return { message: 'Password reset link sent to your email' };
  }

  async resetPassword(token, newPassword) {
    const now = new Date();
    const q2  = { $gt: now };

    const user = await User.findOne({
      passwordResetToken:   token,
      passwordResetExpires: q2,
    }).select('+passwordResetToken +passwordResetExpires +refreshTokens');

    if (!user) throw Object.assign(new Error('Invalid or expired reset token'), { statusCode: 400 });

    user.password             = newPassword;
    user.passwordResetToken   = undefined;
    user.passwordResetExpires = undefined;
    user.refreshTokens        = [];
    await user.save();

    return { message: 'Password reset successfully. Please log in with your new password.' };
  }
}

module.exports = new AuthService();
