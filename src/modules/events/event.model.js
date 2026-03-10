const mongoose = require('mongoose');

/**
 * Event Model
 *
 * CC-18 FIX: Full-text search index added.
 *
 * CRITICAL BUG IN AUDIT REPORT — CORRECTED HERE:
 * The audit recommended indexing { title: 'text', description: 'text' }
 * but this schema uses 'details' as the event body field, NOT 'description'.
 * Indexing 'description' would create an index on a non-existent field —
 * MongoDB would accept it silently but search would return zero results.
 *
 * Correct index: { title: 'text', details: 'text' }
 *
 * Also preserved all compound indexes added in Step 4:
 *   { isActive, isCancelled, startDate }  → getAllUpcoming() CC-08
 *   { communityId, isActive, ... }        → getCommunityEvents()
 *   { 'rsvpList.userId' }                 → getMyRSVPs()
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
  // Field name is 'details' — not 'description'
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

// ─── Step 4 compound indexes (preserved) ──────────────────────────────────────
eventSchema.index({ isActive: 1, isCancelled: 1, startDate: 1 },                  { background: true });
eventSchema.index({ communityId: 1, isActive: 1, isCancelled: 1, startDate: 1 }, { background: true });
eventSchema.index({ 'rsvpList.userId': 1 },                                        { background: true });
eventSchema.index({ communityId: 1, startDate: 1 },                               { background: true });
eventSchema.index({ createdBy: 1 },                                                { background: true });
eventSchema.index({ startDate: 1 },                                                { background: true });
eventSchema.index({ tags: 1 },                                                     { background: true });

// ─── CC-18 FIX: Full-text search index ────────────────────────────────────────
// USES 'details' not 'description' — matches the actual schema field name.
// Audit report had a bug here — indexing 'description' would silently fail.
eventSchema.index(
  { title: 'text', details: 'text' },
  { weights: { title: 10, details: 1 }, background: true }
);

module.exports = mongoose.model('Event', eventSchema);
