const required=['MONGODB_URI','JWT_SECRET','JWT_REFRESH_SECRET','SENDGRID_API_KEY','SENDGRID_FROM_EMAIL'];
const validateEnv=()=>{
  const missing=required.filter((key)=>!process.env[key]);
  if(missing.length>0){
    throw new Error('Missing required environment variables: '+missing.join(', '));
  }
};
module.exports={validateEnv};
