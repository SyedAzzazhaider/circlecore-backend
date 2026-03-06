const mongoose=require("mongoose");
const bcrypt=require("bcryptjs");
const userSchema=new mongoose.Schema({
  email:{type:String,required:[true,"Email is required"],unique:true,lowercase:true,trim:true,validate:{validator:function(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);},message:"Please provide a valid email"}},
  password:{type:String,required:[true,"Password is required"],minlength:[8,"Password must be at least 8 characters"],select:false},
  name:{type:String,required:[true,"Name is required"],trim:true,minlength:[2,"Name must be at least 2 characters"],maxlength:[50,"Name cannot exceed 50 characters"]},
  role:{type:String,enum:["member","moderator","admin","super_admin"],default:"member"},
  isEmailVerified:{type:Boolean,default:false},
  emailVerificationToken:{type:String,select:false},
  emailVerificationExpires:{type:Date,select:false},
  passwordResetToken:{type:String,select:false},
  passwordResetExpires:{type:Date,select:false},
  refreshTokens:{type:[String],select:false,default:[]},
  isSuspended:{type:Boolean,default:false},
  suspendedReason:{type:String,default:null},
  suspendedUntil:{type:Date,default:null},
  warningCount:{type:Number,default:0,min:0},
  inviteCodeUsed:{type:mongoose.Schema.Types.ObjectId,ref:"InviteCode"},
  lastLogin:{type:Date},
  lastActivity:{type:Date,select:false},
  loginAttempts:{type:Number,default:0},
  lockUntil:{type:Date},
  profileId:{type:mongoose.Schema.Types.ObjectId,ref:"Profile"},
  oauthProvider:{type:String,enum:["google","apple","linkedin",null],default:null},
  oauthId:{type:String},

  // ─── Two-Factor Authentication (MODULE A — Document requirement) ──────────
  twoFactorEnabled:  { type: Boolean, default: false },
  twoFactorSecret:   { type: String,  select: false, default: null },
  // Backup codes stored as bcrypt hashes — each consumed on first use
  twoFactorBackupCodes: { type: [String], select: false, default: [] },
},{
  timestamps:true,
  toJSON:{transform:function(doc,ret){
    delete ret.password;
    delete ret.refreshTokens;
    delete ret.emailVerificationToken;
    delete ret.passwordResetToken;
    return ret;
  }}
});
userSchema.pre("save", async function() {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 12);
});
userSchema.methods.comparePassword=async function(candidatePassword){
  return bcrypt.compare(candidatePassword,this.password);
};
userSchema.virtual("isLocked").get(function(){
  return !!(this.lockUntil&&this.lockUntil>Date.now());
});
userSchema.methods.incrementLoginAttempts=async function(){
  if(this.lockUntil&&this.lockUntil<Date.now()){
    var u={};
    u["$set"]={loginAttempts:1};
    u["$unset"]={lockUntil:1};
    await this.updateOne(u);
    return;
  }
  var updates={};
  updates["$inc"]={loginAttempts:1};
  if(this.loginAttempts+1>=5&&!this.isLocked){
    updates["$set"]={lockUntil:Date.now()+2*60*60*1000};
  }
  await this.updateOne(updates);
};
module.exports=mongoose.model("User",userSchema);