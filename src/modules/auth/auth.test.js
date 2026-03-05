const request=require('supertest');
const mongoose=require('mongoose');
const app=require('../../app');
const User=require('./auth.model');
const InviteCode=require('./inviteCode.model');
const Profile=require('../users/profile.model');
jest.mock('../../utils/email',()=>({sendVerificationEmail:jest.fn().mockResolvedValue(true),sendPasswordResetEmail:jest.fn().mockResolvedValue(true)}));
let testInviteCode;
let adminUser;
beforeAll(async()=>{
  await mongoose.connect(process.env.MONGODB_URI||'mongodb://localhost:27017/circlecore_test');
  await User.deleteMany({});
  await InviteCode.deleteMany({});
  await Profile.deleteMany({});
  adminUser=await User.create({name:'Admin User',email:'admin@circlecore.com',password:'Admin@1234',role:'super_admin',isEmailVerified:true});
  await Profile.create({userId:adminUser._id});
  testInviteCode=await InviteCode.create({createdBy:adminUser._id});
});
afterAll(async()=>{
  await User.deleteMany({});
  await InviteCode.deleteMany({});
  await Profile.deleteMany({});
  await mongoose.connection.close();
});
describe('Auth - Registration',()=>{
  it('should reject registration without invite code',async()=>{
    const res=await request(app).post('/api/auth/register').send({name:'Test',email:'test@test.com',password:'Test@1234'});
    expect(res.statusCode).toBe(422);
    expect(res.body.success).toBe(false);
  });
  it('should reject invalid invite code',async()=>{
    const res=await request(app).post('/api/auth/register').send({name:'Test',email:'test@test.com',password:'Test@1234',inviteCode:'INVALIDCODE'});
    expect(res.statusCode).toBe(400);
  });
  it('should register with valid invite code',async()=>{
    const res=await request(app).post('/api/auth/register').send({name:'Test User',email:'testuser@test.com',password:'Test@1234',inviteCode:testInviteCode.code});
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
  });
  it('should reject duplicate email',async()=>{
    const newInvite=await InviteCode.create({createdBy:adminUser._id});
    const res=await request(app).post('/api/auth/register').send({name:'Test User',email:'testuser@test.com',password:'Test@1234',inviteCode:newInvite.code});
    expect(res.statusCode).toBe(409);
  });
});
describe('Auth - Login',()=>{
  beforeAll(async()=>{
    const u=await User.create({name:'Verified',email:'verified@test.com',password:'Test@1234',isEmailVerified:true,role:'member'});
    const p=await Profile.create({userId:u._id});
    await User.findByIdAndUpdate(u._id,{profileId:p._id});
  });
  it('should reject wrong password',async()=>{
    const res=await request(app).post('/api/auth/login').send({email:'verified@test.com',password:'Wrong@1234'});
    expect(res.statusCode).toBe(401);
  });
  it('should reject unverified email',async()=>{
    const res=await request(app).post('/api/auth/login').send({email:'testuser@test.com',password:'Test@1234'});
    expect(res.statusCode).toBe(403);
  });
  it('should login successfully',async()=>{
    const res=await request(app).post('/api/auth/login').send({email:'verified@test.com',password:'Test@1234'});
    expect(res.statusCode).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });
});
describe('Auth - Protected Routes',()=>{
  let token;
  beforeAll(async()=>{
    const res=await request(app).post('/api/auth/login').send({email:'verified@test.com',password:'Test@1234'});
    token=res.body.data.accessToken;
  });
  it('should reject /me without token',async()=>{
    const res=await request(app).get('/api/auth/me');
    expect(res.statusCode).toBe(401);
  });
  it('should return user with valid token',async()=>{
    const res=await request(app).get('/api/auth/me').set('Authorization','Bearer '+token);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.user.email).toBe('verified@test.com');
  });
});
describe('Health Check',()=>{
  it('GET /health returns 200',async()=>{
    const res=await request(app).get('/health');
    expect(res.statusCode).toBe(200);
  });
});
