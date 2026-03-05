const jwt=require('jsonwebtoken');
const generateAccessToken=(payload)=>jwt.sign(payload,process.env.JWT_SECRET,{expiresIn:process.env.JWT_EXPIRES_IN||'15m'});
const generateRefreshToken=(payload)=>jwt.sign(payload,process.env.JWT_REFRESH_SECRET,{expiresIn:process.env.JWT_REFRESH_EXPIRES_IN||'7d'});
const verifyAccessToken=(token)=>jwt.verify(token,process.env.JWT_SECRET);
const verifyRefreshToken=(token)=>jwt.verify(token,process.env.JWT_REFRESH_SECRET);

/**
 * Two-Factor Authentication — temporary token
 * Issued after password passes but before 2FA code is verified.
 * Short-lived (5 min), carries a type claim to prevent misuse as an access token.
 */
const generateTwoFactorTempToken = (userId) => jwt.sign(
  { userId: userId.toString(), type: '2fa_pending' },
  process.env.JWT_SECRET,
  { expiresIn: '5m' }
);

const verifyTwoFactorTempToken = (token) => {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  if (decoded.type !== '2fa_pending') {
    throw new Error('Invalid token type');
  }
  return decoded;
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateTwoFactorTempToken,
  verifyTwoFactorTempToken,
};