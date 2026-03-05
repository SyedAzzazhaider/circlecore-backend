const mongoose=require("mongoose");
const crypto = require("crypto");
const inviteCodeSchema=new mongoose.Schema({
code:{type:String,unique:true,default:function(){return crypto.randomUUID().replace(/-/g,"").substring(0,12).toUpperCase();}},
  communityId:{type:mongoose.Schema.Types.ObjectId,ref:"Community",default:null},
  createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
  usedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",default:null},
  isUsed:{type:Boolean,default:false},
  expiresAt:{type:Date,default:function(){return new Date(Date.now()+7*24*60*60*1000);}},
  maxUses:{type:Number,default:1},
  useCount:{type:Number,default:0},
},{timestamps:true});
inviteCodeSchema.methods.isValid=function(){
  if(this.useCount>=this.maxUses)return false;
  if(this.expiresAt<new Date())return false;
  return true;
};
module.exports=mongoose.model("InviteCode",inviteCodeSchema);