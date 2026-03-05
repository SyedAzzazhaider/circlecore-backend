const mongoose = require('mongoose');

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
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: [5000, 'Description cannot exceed 5000 characters'],
  },
  type: {
    type: String,
    enum: ['webinar', 'meetup', 'online', 'workshop', 'other'],
    default: 'online',
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required'],
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required'],
  },
  timezone: { type: String, default: 'UTC' },
  location: {
    type: { type: String, enum: ['online', 'physical'], default: 'online' },
    address: { type: String, default: '' },
    meetingUrl: { type: String, default: '' },
  },
  coverImage: { type: String, default: null },
  maxAttendees: { type: Number, default: null },
  rsvpList: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['going', 'maybe', 'not_going'], default: 'going' },
    rsvpAt: { type: Date, default: Date.now },
  }],
  attendeeCount: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  isCancelled: { type: Boolean, default: false },
  tags: { type: [String], default: [] },
}, { timestamps: true });

eventSchema.index({ communityId: 1, startDate: 1 });
eventSchema.index({ createdBy: 1 });
eventSchema.index({ startDate: 1 });

module.exports = mongoose.model('Event', eventSchema);