const authService=require('./auth.service');
const ApiResponse=require('../../utils/apiResponse');
class AuthController{
  async register(req,res,next){try{const{name,email,password,inviteCode}=req.body;const result=await authService.register({name,email,password,inviteCode});return ApiResponse.created(res,result,result.message);}catch(error){next(error);}}
  async verifyEmail(req,res,next){try{const{token}=req.params;const result=await authService.verifyEmail(token);return ApiResponse.success(res,result,result.message);}catch(error){next(error);}}
  async login(req,res,next){try{const{email,password}=req.body;const result=await authService.login({email,password,userAgent:req.headers['user-agent'],ipAddress:req.ip});res.cookie('refreshToken',result.refreshToken,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',maxAge:7*24*60*60*1000});return ApiResponse.success(res,{accessToken:result.accessToken,user:result.user},'Login successful');}catch(error){next(error);}}
  async refreshToken(req,res,next){try{const token=req.cookies?.refreshToken||req.body?.refreshToken;const result=await authService.refreshToken(token);res.cookie('refreshToken',result.refreshToken,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',maxAge:7*24*60*60*1000});return ApiResponse.success(res,{accessToken:result.accessToken},'Token refreshed');}catch(error){next(error);}}
  async logout(req,res,next){try{const token=req.cookies?.refreshToken||req.body?.refreshToken;await authService.logout(req.user._id,token);res.clearCookie('refreshToken');return ApiResponse.success(res,{},'Logged out successfully');}catch(error){next(error);}}
  async forgotPassword(req,res,next){try{const{email}=req.body;const result=await authService.forgotPassword(email);return ApiResponse.success(res,{},result.message);}catch(error){next(error);}}
  async resetPassword(req,res,next){try{const{token}=req.params;const{password}=req.body;const result=await authService.resetPassword(token,password);return ApiResponse.success(res,{},result.message);}catch(error){next(error);}}
  async generateInviteCode(req,res,next){try{const{communityId,maxUses}=req.body;const invite=await authService.generateInviteCode(req.user._id,{communityId,maxUses});return ApiResponse.created(res,{invite},'Invite code generated');}catch(error){next(error);}}
  async getMe(req,res,next){try{return ApiResponse.success(res,{user:req.user},'User fetched');}catch(error){next(error);}}
}
module.exports=new AuthController();
