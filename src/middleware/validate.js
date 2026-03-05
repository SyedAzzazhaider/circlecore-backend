const {validationResult}=require('express-validator');
const ApiResponse=require('../utils/apiResponse');
const validate=(req,res,next)=>{
  const errors=validationResult(req);
  if(!errors.isEmpty()){
    return ApiResponse.validationError(res,errors.array().map(e=>({field:e.path,message:e.msg})));
  }
  next();
};
module.exports=validate;
