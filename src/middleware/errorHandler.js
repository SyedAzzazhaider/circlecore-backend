const logger=require('../utils/logger');
const errorHandler=(err,req,res,next)=>{
  let statusCode=err.statusCode||500;
  let message=err.message||'Internal Server Error';
  if(err.code===11000){
    statusCode=409;
    const field=Object.keys(err.keyValue)[0];
    message=field.charAt(0).toUpperCase()+field.slice(1)+' already exists';
  }
  if(err.name==='ValidationError'){statusCode=422;message=Object.values(err.errors).map(e=>e.message).join(', ');}
  if(err.name==='JsonWebTokenError'){statusCode=401;message='Invalid token';}
  if(err.name==='TokenExpiredError'){statusCode=401;message='Token expired';}
  if(err.name==='CastError'){statusCode=400;message='Invalid ID format';}
  logger.error(statusCode+' - '+message+' - '+req.originalUrl+' - '+req.method);
  res.status(statusCode).json({success:false,message,...(process.env.NODE_ENV==='development'&&{stack:err.stack})});
};
module.exports=errorHandler;
