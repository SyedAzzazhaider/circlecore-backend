const mongoose = require('mongoose');

/**
 * Event Model
 *
 * CC-20 FIX: Compound indexes added for queries introduced in Steps 2 and 3.
 *
 * getAllUpcoming() — added in Step 2 (CC-08) — queries:
 *   { isActive: true, isCancelled: false, startDate: { $gte: now } }
 *
 * Without a compound index, MongoDB falls back to the single-field { startDate: 1 }
 * index but still has to filter isCancelled and isActive in-memory.
 *
 * With { isActive: 1, isCancelled: 1, startDate: 1 } compound index:
 *   - MongoDB eliminates cancelled/inactive events at the index level
 *   - startDate range scan is applied only to the remaining subset
 *   - Covers the full WHERE clause with no in-memory filtering
 *
 * Also added: { 'rsvpList.userId': 1 } for getMyRSVPs() which queries
 *   Event.find({ 'rsvpList.userId': userId }) — an array field that requires
 *   a multi-key index to avoid a full collection scan.
 */
const eventSchema = new mongoose.Schema({
  communityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    required: [true, 'Community is required'],
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  title: {
    type: String,
    required: [true, 'Event title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters'],
  },
  details: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: [5000, 'Description cannot exceed 5000 characters'],
  },
  type: {
    type: String,
    enum: ['webinar', 'meetup', 'online', 'workshop', 'other'],
    default: 'online',
  },
  startDate: { type: Date, required: [true, 'Start date is required'] },
  endDate:   { type: Date, required: [true, 'End date is required'] },
  timezone:  { type: String, default: 'UTC' },
  location: {
    type:       { type: String, enum: ['online', 'physical'], default: 'online' },
    address:    { type: String, default: '' },
    meetingUrl: { type: String, default: '' },
  },
  coverImage:   { type: String, default: null },
  maxAttendees: { type: Number, default: null },
  rsvpList: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['going', 'maybe', 'not_going'], default: 'going' },
    rsvpAt: { type: Date, default: Date.now },
  }],
  attendeeCount: { type: Number, default: 0 },
  isActive:      { type: Boolean, default: true },
  isCancelled:   { type: Boolean, default: false },
  tags:          { type: [String], default: [] },
}, { timestamps: true });

// ─── CC-20 FIX: Indexes ───────────────────────────────────────────────────────

// CC-08 getAllUpcoming() — primary compound: covers isActive + isCancelled + date range
eventSchema.index(
  { isActive: 1, isCancelled: 1, startDate: 1 },
  { background: true }
);

// Community events page — getCommunityEvents()
eventSchema.index(
  { communityId: 1, isActive: 1, isCancelled: 1, startDate: 1 },
  { background: true }
);

// getMyRSVPs() — queries by nested rsvpList.userId (multi-key index required)
eventSchema.index({ 'rsvpList.userId': 1 }, { background: true });

// Preserved original indexes (kept as-is for backward compatibility)
eventSchema.index({ communityId: 1, startDate: 1 }, { background: true });
eventSchema.index({ createdBy: 1 },                  { background: true });
eventSchema.index({ startDate: 1 },                   { background: true });

// Tags search
eventSchema.index({ tags: 1 }, { background: true });

// ─────────────────────────────────────────────────────────────────────────────

module.exports = mongoose.model('Event', eventSchema);
