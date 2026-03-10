const Event     = require('./event.model');
const Community = require('../communities/community.model');
const logger    = require('../../utils/logger');

/**
 * Event Service — MODULE D/E
 *
 * CC-08 FIX: getAllUpcoming() added — platform-wide event discovery endpoint.
 *   Previously only getCommunityEvents() existed, requiring users to know
 *   specific community IDs. Users could not browse upcoming events globally.
 */

class EventService {

  async createEvent({ communityId, createdBy, title, details, type, startDate, endDate, timezone, location, maxAttendees, tags }) {
    const community = await Community.findById(communityId);
    if (!community) throw Object.assign(new Error('Community not found'), { statusCode: 404 });

    if (!community.isMember(createdBy)) {
      throw Object.assign(new Error('You must be a member to create events'), { statusCode: 403 });
    }

    if (new Date(startDate) >= new Date(endDate)) {
      throw Object.assign(new Error('End date must be after start date'), { statusCode: 400 });
    }

    const event = await Event.create({
      communityId,
      createdBy,
      title,
      details,
      type:         type        || 'online',
      startDate,
      endDate,
      timezone:     timezone    || 'UTC',
      location:     location    || { type: 'online' },
      maxAttendees: maxAttendees || null,
      tags:         tags        || [],
    });

    try {
      await this.scheduleEventReminder(event);
    } catch (e) {
      logger.warn('Event reminder scheduling failed: ' + e.message);
    }

    logger.info('Event created: ' + event._id + ' in community: ' + communityId);
    return event;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CC-08 FIX: Platform-wide event discovery — GET /api/events
  //
  // Previously missing entirely. Users had no way to browse upcoming events
  // across all communities without knowing specific community IDs.
  //
  // Returns all upcoming, active, non-cancelled events sorted by startDate ASC
  // (soonest first). Supports pagination and optional filters:
  //   ?type=online|in-person  — filter by event type
  //   ?communityId=<id>       — narrow to a specific community (reuses this endpoint
  //                             instead of duplicating GET /community/:id)
  // ─────────────────────────────────────────────────────────────────────────────
  async getAllUpcoming({ page = 1, limit = 10, type, communityId } = {}) {
    const pageNum  = parseInt(page)  || 1;
    const limitNum = parseInt(limit) || 10;
    const skip = (pageNum - 1) * limitNum;

    const query = {
      isActive:    true,
      isCancelled: false,
      startDate:   { $gte: new Date() },
    };

    if (type)        query.type        = type;
    if (communityId) query.communityId = communityId;

    const [total, events] = await Promise.all([
      Event.countDocuments(query),
      Event.find(query)
        .populate('communityId', 'name slug avatar')
        .populate('createdBy',   'name email')
        .sort({ startDate: 1 })
        .skip(skip)
        .limit(limitNum),
    ]);

    return {
      events,
      pagination: {
        total,
        page:  pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    };
  }

  async scheduleEventReminder(event) {
    const now             = new Date();
    const eventStart      = new Date(event.startDate);
    const msUntilEvent    = eventStart - now;
    const msUntilReminder = msUntilEvent - (24 * 60 * 60 * 1000);

    if (msUntilReminder <= 0) {
      logger.info('Event starts in <24h — reminder queued immediately: ' + event._id);
      setTimeout(() => this.sendEventReminders(event._id), 1000);
      return;
    }

    logger.info(
      'Event reminder scheduled in ' + Math.round(msUntilReminder / 60000) +
      ' minutes for event: ' + event._id
    );
    setTimeout(() => this.sendEventReminders(event._id), msUntilReminder);
  }

  async sendEventReminders(eventId) {
    try {
      const event = await Event.findById(eventId);
      if (!event || event.isCancelled || !event.isActive) return;

      const NotificationService = require('../notifications/notification.service');
      const goingUsers          = event.rsvpList.filter(r => r.status === 'going');

      for (const rsvp of goingUsers) {
        await NotificationService.createNotification({
          userId:  rsvp.userId,
          type:    'event_reminder',
          title:   'Event starting soon: ' + event.title,
          message: 'Your event "' + event.title + '" starts in 24 hours.',
          meta: {
            eventId:     event._id,
            communityId: event.communityId,
            startDate:   event.startDate,
          },
        });
      }

      logger.info('Event reminders sent to ' + goingUsers.length + ' users for event: ' + eventId);
    } catch (error) {
      logger.error('Failed to send event reminders: ' + error.message);
    }
  }

  async getCommunityEvents(communityId, { page = 1, limit = 10, upcoming = true }) {
    const query = { communityId, isActive: true, isCancelled: false };
    if (upcoming) query.startDate = { $gte: new Date() };

    const skip  = (page - 1) * limit;
    const total = await Event.countDocuments(query);

    const events = await Event.find(query)
      .populate('createdBy', 'name email')
      .sort({ startDate: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    return {
      events,
      pagination: {
        total,
        page:  parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getEventById(eventId) {
    const event = await Event.findById(eventId)
      .populate('createdBy',   'name email')
      .populate('communityId', 'name slug');
    if (!event || !event.isActive) throw Object.assign(new Error('Event not found'), { statusCode: 404 });
    return event;
  }

  async rsvpEvent(eventId, userId, status) {
    const event = await Event.findById(eventId);
    if (!event || !event.isActive) throw Object.assign(new Error('Event not found'), { statusCode: 404 });
    if (event.isCancelled) throw Object.assign(new Error('Event has been cancelled'), { statusCode: 400 });

    if (event.maxAttendees && event.attendeeCount >= event.maxAttendees && status === 'going') {
      throw Object.assign(new Error('Event is at full capacity'), { statusCode: 400 });
    }

    const existingIndex = event.rsvpList.findIndex(
      r => r.userId.toString() === userId.toString()
    );

    if (existingIndex > -1) {
      event.rsvpList[existingIndex].status = status;
    } else {
      event.rsvpList.push({ userId, status, rsvpAt: new Date() });
    }

    event.attendeeCount = event.rsvpList.filter(r => r.status === 'going').length;
    await event.save();

    if (status === 'going') {
      try { await this.scheduleEventReminder(event); } catch (e) {
        logger.warn('Reminder scheduling failed on RSVP: ' + e.message);
      }
    }

    if (status === 'going' && event.createdBy.toString() !== userId.toString()) {
      try {
        const NotificationService = require('../notifications/notification.service');
        await NotificationService.createNotification({
          userId:  event.createdBy,
          type:    'event_invite',
          title:   'New RSVP on your event',
          message: 'A member RSVP\'d to your event: ' + event.title,
          meta: {
            fromUserId:  userId,
            eventId:     event._id,
            communityId: event.communityId,
          },
        });
      } catch (e) {
        logger.warn('event_invite notification failed: ' + e.message);
      }
    }

    logger.info('User ' + userId + ' RSVP ' + status + ' for event: ' + eventId);
    return event;
  }

  async cancelEvent(eventId, userId, userRole) {
    const event = await Event.findById(eventId);
    if (!event) throw Object.assign(new Error('Event not found'), { statusCode: 404 });

    const isCreator = event.createdBy.toString() === userId.toString();
    const isAdmin   = ['admin', 'super_admin'].includes(userRole);

    if (!isCreator && !isAdmin) {
      throw Object.assign(new Error('Only the event creator or admin can cancel events'), { statusCode: 403 });
    }

    event.isCancelled = true;
    await event.save();

    try {
      const NotificationService = require('../notifications/notification.service');
      const goingUsers          = event.rsvpList.filter(r => r.status === 'going');

      for (const rsvp of goingUsers) {
        await NotificationService.createNotification({
          userId:  rsvp.userId,
          type:    'event_cancelled',
          title:   'Event cancelled: ' + event.title,
          message: 'An event you RSVP\'d to has been cancelled.',
          meta: { eventId: event._id, communityId: event.communityId },
        });
      }
    } catch (e) {
      logger.warn('Cancellation notifications failed: ' + e.message);
    }

    return { message: 'Event cancelled successfully' };
  }

  async getMyRSVPs(userId) {
    const events = await Event.find({
      'rsvpList.userId': userId,
      isActive: true,
    }).populate('communityId', 'name slug').sort({ startDate: 1 });
    return events;
  }

  async getCalendarLinks(eventId) {
    const event = await Event.findById(eventId);
    if (!event || !event.isActive) throw Object.assign(new Error('Event not found'), { statusCode: 404 });
    const calendarService = require('./calendar.service');
    return calendarService.getCalendarLinks(event);
  }

  async getIcal(eventId) {
    const event = await Event.findById(eventId);
    if (!event || !event.isActive) throw Object.assign(new Error('Event not found'), { statusCode: 404 });
    const calendarService = require('./calendar.service');
    return {
      ical:     calendarService.generateIcal(event),
      filename: event.title.replace(/\s+/g, '-').toLowerCase() + '.ics',
    };
  }
}

module.exports = new EventService();
