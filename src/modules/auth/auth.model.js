const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const { PROFILE_TIERS } = require('../../constants/tiers');

/**
 * User Auth Model
 *
 * CC-05 FIX: deviceToken and devicePlatform fields added.
 *
 * These fields store the user's OneSignal subscription/player ID
 * so the server can send push notifications when the user is offline.
 *
 * Flow:
 *   1. Frontend calls OneSignal SDK → gets a player/subscription ID
 *   2. Frontend calls POST /api/profiles/me/device-token with that ID
 *   3. Server stores it here on the User document
 *   4. NotificationService.createNotification() reads it and calls OneSignal
 *   5. On logout, deviceToken is cleared → no notifications to signed-out devices
 *
 * Also preserves all CC-18 indexes from Step 4.
 */
const userSchema = new mongoose.Schema({
  email: {
    type: String, required: [true, 'Email is required'], unique: true,
    lowercase: true, trim: true,
    validate: {
      validator: function(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); },
      message: 'Please provide a valid email',
    },
  },
  password: {
    type: String, required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'], select: false,
  },
  name: {
    type: String, required: [true, 'Name is required'], trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [50, 'Name cannot exceed 50 characters'],
  },
  role: {
    type: String,
    enum: ['member', 'moderator', 'admin', 'super_admin'],
    default: 'member',
  },
  isEmailVerified:          { type: Boolean, default: false },
  emailVerificationToken:   { type: String,  select: false },
  emailVerificationExpires: { type: Date,    select: false },
  passwordResetToken:       { type: String,  select: false },
  passwordResetExpires:     { type: Date,    select: false },
  refreshTokens:            { type: [String], select: false, default: [] },

  isSuspended:     { type: Boolean, default: false },
  suspendedReason: { type: String,  default: null },
  suspendedUntil:  { type: Date,    default: null },
  warningCount:    { type: Number,  default: 0, min: 0 },

  inviteCodeUsed: { type: mongoose.Schema.Types.ObjectId, ref: 'InviteCode' },
  lastLogin:      { type: Date },
  lastActivity:   { type: Date, select: false },
  loginAttempts:  { type: Number, default: 0 },
  lockUntil:      { type: Date },
  profileId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Profile' },

  oauthProvider: { type: String, enum: ['google', 'apple', 'linkedin', null], default: null },
  oauthId:       { type: String },

  twoFactorEnabled:     { type: Boolean, default: false },
  twoFactorSecret:      { type: String,  select: false, default: null },
  twoFactorBackupCodes: { type: [String], select: false, default: [] },

  // CC-14 (Step 3): GDPR email consent
  emailOptIn: { type: Boolean, default: false },

  // ─── CC-05 FIX: OneSignal push notification device registration ───────────
  // deviceToken: OneSignal subscription/player ID — set after user grants
  //   browser push permission and OneSignal SDK initializes on the frontend.
  //   Cleared on logout to prevent notifications to signed-out devices.
  //
  // devicePlatform: which platform registered the token — used for analytics
  //   and platform-specific notification formatting in future iterations.
  deviceToken:    { type: String, default: null },
  devicePlatform: {
    type: String,
    enum: ['web', 'ios', 'android', null],
    default: null,
  },
  // ─────────────────────────────────────────────────────────────────────────

}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.refreshTokens;
      delete ret.emailVerificationToken;
      delete ret.passwordResetToken;
      return ret;
    },
  },
});

// ─── CC-18 (Step 4) Indexes — preserved ──────────────────────────────────────
userSchema.index({ email: 1 },                         { unique: true, background: true });
userSchema.index({ role: 1 },                          { background: true });
userSchema.index({ isSuspended: 1 },                   { background: true });
userSchema.index({ isSuspended: 1, suspendedUntil: 1 },{ background: true });
userSchema.index({ oauthProvider: 1, oauthId: 1 },     { sparse: true, background: true });
userSchema.index({ emailOptIn: 1, isEmailVerified: 1 },{ background: true });
userSchema.index({ createdAt: -1 },                    { background: true });
// ─────────────────────────────────────────────────────────────────────────────

userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

userSchema.methods.incrementLoginAttempts = async function() {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    await this.updateOne({ $set: { loginAttempts: 1 }, $unset: { lockUntil: 1 } });
    return;
  }
  const updates = { $inc: { loginAttempts: 1 } };
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 };
  }
  await this.updateOne(updates);
};

module.exports = mongoose.model('User', userSchema);
