const mongoose=require('mongoose');
const logger=require('../utils/logger');
const connectDB=async()=>{
  try{
    const conn=await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:5000});
    logger.info('MongoDB Connected: '+conn.connection.host);
  }catch(error){
    logger.error('MongoDB Connection Error: '+error.message);
    process.exit(1);
  }
};
mongoose.connection.on('disconnected',()=>logger.warn('MongoDB disconnected'));
mongoose.connection.on('reconnected',()=>logger.info('MongoDB reconnected'));
module.exports=connectDB;
