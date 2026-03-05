const crypto=require("crypto");
const User=require("./auth.model");
const InviteCode=require("./inviteCode.model");
const Profile=require("../users/profile.model");
const {generateAccessToken,generateRefreshToken,verifyRefreshToken,generateTwoFactorTempToken}=require("../../utils/jwt");
const {sendVerificationEmail,sendPasswordResetEmail}=require("../../utils/email");
const logger=require("../../utils/logger");
class AuthService{
  async validateInviteCode(code){
    const invite=await InviteCode.findOne({code:code.toUpperCase()});
    if(!invite)throw Object.assign(new Error("Invalid invite code"),{statusCode:400});
    if(!invite.isValid())throw Object.assign(new Error("Invite code is expired or already used"),{statusCode:400});
    return invite;
  }
  async register({name,email,password,inviteCode}){
    const invite=await this.validateInviteCode(inviteCode);
    const existingUser=await User.findOne({email:email.toLowerCase()});
    if(existingUser)throw Object.assign(new Error("Email already registered"),{statusCode:409});
    const verificationToken=crypto.randomBytes(32).toString("hex");
    const verificationExpires=new Date(Date.now()+24*60*60*1000);
    const user=await User.create({name,email,password,inviteCodeUsed:invite._id,emailVerificationToken:verificationToken,emailVerificationExpires:verificationExpires});
    const profile=await Profile.create({userId:user._id});
    await User.findByIdAndUpdate(user._id,{profileId:profile._id});
    invite.useCount+=1;
    invite.usedBy=user._id;
    if(invite.useCount>=invite.maxUses)invite.isUsed=true;
    await invite.save();
    await sendVerificationEmail(user.email,user.name,verificationToken);
    logger.info("New user registered: "+user.email);
    return{message:"Registration successful. Please check your email to verify your account.",userId:user._id};
  }
  async verifyEmail(token){
    var q={};q["$gt"]=new Date();
    const user=await User.findOne({emailVerificationToken:token,emailVerificationExpires:q}).select("+emailVerificationToken +emailVerificationExpires");
    if(!user)throw Object.assign(new Error("Invalid or expired verification token"),{statusCode:400});
    user.isEmailVerified=true;
    user.emailVerificationToken=undefined;
    user.emailVerificationExpires=undefined;
    await user.save();
    return{message:"Email verified successfully. You can now log in."};
  }
  async login({email,password,userAgent,ipAddress}){
    const user=await User.findOne({email:email.toLowerCase()}).select("+password +refreshTokens +loginAttempts +lockUntil +twoFactorEnabled");
    if(!user)throw Object.assign(new Error("Invalid email or password"),{statusCode:401});
    if(user.isLocked)throw Object.assign(new Error("Account temporarily locked"),{statusCode:423});
    const isPasswordValid=await user.comparePassword(password);
    if(!isPasswordValid){await user.incrementLoginAttempts();throw Object.assign(new Error("Invalid email or password"),{statusCode:401});}
    if(!user.isEmailVerified)throw Object.assign(new Error("Please verify your email before logging in"),{statusCode:403});
    if(user.isSuspended)throw Object.assign(new Error("Account suspended. Contact support."),{statusCode:403});

    // ─── 2FA gate ─────────────────────────────────────────────────────────────
    // Password is correct. If 2FA is enabled, do NOT issue full tokens yet.
    // Issue a short-lived (5 min) temp token — client must complete 2FA verification.
    if(user.twoFactorEnabled){
      // Reset login attempts since password was valid
      await User.findByIdAndUpdate(user._id,{loginAttempts:0,$unset:{lockUntil:1}});
      const twoFactorTempToken=generateTwoFactorTempToken(user._id);
      logger.info("2FA verification required for user: "+user.email);
      return{requiresTwoFactor:true,twoFactorTempToken};
    }
    // ─────────────────────────────────────────────────────────────────────────

    const payload={userId:user._id,role:user.role,email:user.email};
    const accessToken=generateAccessToken(payload);
    const refreshToken=generateRefreshToken(payload);
    const tokens=user.refreshTokens||[];
    tokens.push(refreshToken);
    if(tokens.length>5)tokens.shift();
    var upd={refreshTokens:tokens,lastLogin:new Date(),loginAttempts:0};
    upd["$unset"]={lockUntil:1};
    await User.findByIdAndUpdate(user._id,upd);
    logger.info("User logged in: "+user.email);
    return{accessToken,refreshToken,user:{_id:user._id,name:user.name,email:user.email,role:user.role,profileId:user.profileId}};
  }
  async refreshToken(token){
    if(!token)throw Object.assign(new Error("Refresh token required"),{statusCode:401});
    let decoded;
    try{decoded=verifyRefreshToken(token);}catch(e){throw Object.assign(new Error("Invalid or expired refresh token"),{statusCode:401});}
    const user=await User.findById(decoded.userId).select("+refreshTokens");
    if(!user)throw Object.assign(new Error("User not found"),{statusCode:401});
    const tokenIndex=user.refreshTokens.indexOf(token);
    if(tokenIndex===-1)throw Object.assign(new Error("Refresh token revoked"),{statusCode:401});
    const payload={userId:user._id,role:user.role,email:user.email};
    const newAccessToken=generateAccessToken(payload);
    const newRefreshToken=generateRefreshToken(payload);
    user.refreshTokens[tokenIndex]=newRefreshToken;
    await user.save();
    return{accessToken:newAccessToken,refreshToken:newRefreshToken};
  }
  async logout(userId,refreshToken){
    var p={};p["$pull"]={refreshTokens:refreshToken};
    await User.findByIdAndUpdate(userId,p);
    return{message:"Logged out successfully"};
  }
  async forgotPassword(email){
    const user=await User.findOne({email:email.toLowerCase()});
    if(!user)return{message:"If that email is registered, you will receive a reset link."};
    const resetToken=crypto.randomBytes(32).toString("hex");
    const resetExpires=new Date(Date.now()+60*60*1000);
    await User.findByIdAndUpdate(user._id,{passwordResetToken:resetToken,passwordResetExpires:resetExpires});
    await sendPasswordResetEmail(user.email,user.name,resetToken);
    return{message:"If that email is registered, you will receive a reset link."};
  }
  async resetPassword(token,newPassword){
    var q2={};q2["$gt"]=new Date();
    const user=await User.findOne({passwordResetToken:token,passwordResetExpires:q2}).select("+passwordResetToken +passwordResetExpires +refreshTokens");
    if(!user)throw Object.assign(new Error("Invalid or expired reset token"),{statusCode:400});
    user.password=newPassword;
    user.passwordResetToken=undefined;
    user.passwordResetExpires=undefined;
    user.refreshTokens=[];
    await user.save();
    return{message:"Password reset successfully. Please log in."};
  }
  async generateInviteCode(userId,{communityId=null,maxUses=1}={}){
    const invite=await InviteCode.create({createdBy:userId,communityId,maxUses});
    return invite;
  }

  /**
   * POST /invites/redeem
   * Document Section 9 API Contract — standalone invite code validation.
   * Validates an invite code and returns its details WITHOUT consuming it.
   * Consumption happens only at registration (register method).
   * This endpoint lets the frontend verify a code is valid before showing the signup form.
   */
  async redeemInviteCode(code){
    if(!code)throw Object.assign(new Error("Invite code is required"),{statusCode:400});
    const invite=await this.validateInviteCode(code);
    return{
      message:"Invite code is valid.",
      valid:true,
      communityId:invite.communityId||null,
      expiresAt:invite.expiresAt,
      usesRemaining:invite.maxUses-invite.useCount,
    };
  }
}
module.exports=new AuthService();