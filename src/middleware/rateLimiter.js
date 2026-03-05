const rateLimit=require('express-rate-limit');
const globalLimiter=rateLimit({windowMs:15*60*1000,max:100,standardHeaders:true,legacyHeaders:false,message:{success:false,message:'Too many requests, please try again later'}});
const authLimiter=rateLimit({windowMs:15*60*1000,max:10,standardHeaders:true,legacyHeaders:false,message:{success:false,message:'Too many authentication attempts, try again in 15 minutes'}});
const postLimiter=rateLimit({windowMs:60*1000,max:20,message:{success:false,message:'Too many requests, slow down'}});
module.exports={globalLimiter,authLimiter,postLimiter};
