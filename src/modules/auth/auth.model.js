const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

/**
 * User Auth Model
 *
 * CC-18 FIX: Critical MongoDB indexes added.
 *
 * Previously: ZERO indexes on this model. Every login, suspension check,
 * and email-verify call was a full collection scan (O(N)).
 *
 * Added indexes:
 *   { email: 1 }                      → Unique index — login lookup (every request)
 *   { role: 1 }                        → Admin/mod queries, super_admin checks
 *   { isSuspended: 1 }                 → Suspension check on every auth middleware call
 *   { emailOptIn: 1, isEmailVerified: 1 } → Weekly digest query (CC-14)
 *   { oauthProvider: 1, oauthId: 1 }   → OAuth login lookup
 *   { createdAt: -1 }                  → Admin user listing, pagination
 *
 * Note: email unique: true on the field definition already creates a unique index
 * in Mongoose, but the explicit compound index below makes the query planner
 * use a tighter, covered index for the login path.
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

// ─── CC-18 FIX: Indexes ───────────────────────────────────────────────────────

// Primary auth lookup — covers login, token refresh, middleware auth check
// email has unique:true which creates an index, but explicit declaration
// ensures Mongoose uses it as a covered index for projection queries
userSchema.index({ email: 1 }, { unique: true, background: true });

// Role-based queries — admin panel, moderator lookups
userSchema.index({ role: 1 }, { background: true });

// Suspension check — runs on EVERY authenticated request via auth middleware
userSchema.index({ isSuspended: 1 }, { background: true });

// Auto-lift expired suspensions — moderation.service.js liftExpiredSuspensions()
userSchema.index({ isSuspended: 1, suspendedUntil: 1 }, { background: true });

// OAuth login — Google/Apple/LinkedIn login lookup
userSchema.index({ oauthProvider: 1, oauthId: 1 }, { sparse: true, background: true });

// Email digest eligibility — digest.service.js sendWeeklyDigests()
userSchema.index({ emailOptIn: 1, isEmailVerified: 1 }, { background: true });

// Admin user listing + pagination
userSchema.index({ createdAt: -1 }, { background: true });

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
