const twoFactorService = require('./twoFactor.service');
const ApiResponse = require('../../utils/apiResponse');

/**
 * TwoFactorController
 * Document requirement: MODULE A — Two-Factor Auth (optional)
 *
 * Thin HTTP layer — all business logic lives in twoFactor.service.js.
 * Each method maps one-to-one with a route.
 */
class TwoFactorController {

  /**
   * POST /api/auth/2fa/setup
   * Protected — requires authenticated user.
   * Returns: { secret, qrCode, message }
   */
  async setup(req, res, next) {
    try {
      const result = await twoFactorService.setupTwoFactor(req.user._id);
      return ApiResponse.success(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/2fa/enable
   * Protected — requires authenticated user.
   * Body: { totpCode }
   * Returns: { message, backupCodes, warning }
   */
  async enable(req, res, next) {
    try {
      const { totpCode } = req.body;

      if (!totpCode) {
        return res.status(400).json({
          success: false,
          message: 'Verification code is required.',
        });
      }

      const result = await twoFactorService.enableTwoFactor(req.user._id, totpCode);
      return ApiResponse.success(res, result, result.message);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/2fa/verify-login
   * Public — called after standard login when requiresTwoFactor === true.
   * Body: { twoFactorTempToken, totpCode }
   * Returns: { accessToken, refreshToken, user }
   * Sets: httpOnly refreshToken cookie
   */
  async verifyLogin(req, res, next) {
    try {
      const { twoFactorTempToken, totpCode } = req.body;

      const result = await twoFactorService.verifyLoginToken(twoFactorTempToken, totpCode);

      // Set httpOnly refresh token cookie — identical to standard login
      res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return ApiResponse.success(
        res,
        {
          accessToken: result.accessToken,
          user: result.user,
        },
        'Login successful'
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/auth/2fa/disable
   * Protected — requires authenticated user.
   * Body: { password, totpCode }
   * Returns: { message }
   */
  async disable(req, res, next) {
    try {
      const { password, totpCode } = req.body;

      if (!password || !totpCode) {
        return res.status(400).json({
          success: false,
          message: 'Password and verification code are required.',
        });
      }

      const result = await twoFactorService.disableTwoFactor(
        req.user._id,
        password,
        totpCode
      );

      return ApiResponse.success(res, {}, result.message);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new TwoFactorController();