const {verifyAccessToken}=require('../utils/jwt');
const User=require('../modules/auth/auth.model');
const ApiResponse=require('../utils/apiResponse');
const logger=require('../utils/logger');
const authenticate=async(req,res,next)=>{
  try{
    let token;
    if(req.headers.authorization&&req.headers.authorization.startsWith('Bearer ')){
      token=req.headers.authorization.split(' ')[1];
    }else if(req.cookies?.accessToken){
      token=req.cookies.accessToken;
    }
    if(!token)return ApiResponse.unauthorized(res,'Access token required');
    const decoded=verifyAccessToken(token);
    const user=await User.findById(decoded.userId).select('-password -refreshTokens');
    if(!user)return ApiResponse.unauthorized(res,'User not found');
    if(!user.isEmailVerified)return ApiResponse.unauthorized(res,'Please verify your email first');
    if(user.isSuspended)return ApiResponse.forbidden(res,'Account suspended. Contact support.');
    req.user=user;
    next();
  }catch(error){
    logger.error('Authentication error: '+error.message);
    return ApiResponse.unauthorized(res,error.message||'Authentication failed');
  }
};
const authorize=(...roles)=>{
  return(req,res,next)=>{
    if(!roles.includes(req.user.role))return ApiResponse.forbidden(res,'You do not have permission to perform this action');
    next();
  };
};
module.exports={authenticate,authorize};
