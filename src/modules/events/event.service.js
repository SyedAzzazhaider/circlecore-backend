const Event = require('./event.model');
const Community = require('../communities/community.model');
const logger = require('../../utils/logger');

class EventService {

  async createEvent({ communityId, createdBy, title, description, type, startDate, endDate, timezone, location, maxAttendees, tags }) {
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
      description,
      type: type || 'online',
      startDate,
      endDate,
      timezone: timezone || 'UTC',
      location: location || { type: 'online' },
      maxAttendees: maxAttendees || null,
      tags: tags || [],
    });

    // Document requirement: schedule event reminder notification
    try {
      await this.scheduleEventReminder(event);
    } catch (e) {
      logger.warn('Event reminder scheduling failed: ' + e.message);
    }

    logger.info('Event created: ' + event._id + ' in community: ' + communityId);
    return event;
  }

  /**
   * Document requirement: MODULE E — Event reminders
   * Sends notification to all RSVP'd users 24 hours before event starts.
   * Uses setTimeout — acceptable for MVP scale.
   * NOTE: For production at 50K+ members, replace with a persistent job queue
   * (e.g. BullMQ + Redis) to survive process restarts.
   */
  async scheduleEventReminder(event) {
    const now = new Date();
    const eventStart = new Date(event.startDate);
    const msUntilEvent = eventStart - now;
    const msUntilReminder = msUntilEvent - (24 * 60 * 60 * 1000); // 24h before

    if (msUntilReminder <= 0) {
      // Event starts within 24h — fire reminder immediately (1s delay for DB flush)
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

  /**
   * Send reminder notifications to all users with status 'going'
   */
  async sendEventReminders(eventId) {
    try {
      const event = await Event.findById(eventId);
      if (!event || event.isCancelled || !event.isActive) return;

      const NotificationService = require('../notifications/notification.service');
      const goingUsers = event.rsvpList.filter(r => r.status === 'going');

      for (const rsvp of goingUsers) {
        await NotificationService.createNotification({
          userId: rsvp.userId,
          type: 'event_reminder',
          title: 'Event starting soon: ' + event.title,
          message: 'Your event "' + event.title + '" starts in 24 hours.',
          meta: {
            eventId: event._id,
            communityId: event.communityId,
            startDate: event.startDate,
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

    const skip = (page - 1) * limit;
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
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getEventById(eventId) {
    const event = await Event.findById(eventId)
      .populate('createdBy', 'name email')
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

    // Schedule reminder for newly confirmed RSVP
    if (status === 'going') {
      try {
        await this.scheduleEventReminder(event);
      } catch (e) {
        logger.warn('Reminder scheduling failed on RSVP: ' + e.message);
      }
    }

    // ─── BUG 3 FIX — event_invite notification ────────────────────────────────
    // Document requirement: event_invite notification type must be triggered.
    // Previously: enum type existed in the notification model but was never fired.
    // Fix: notify the event creator whenever a member RSVPs as 'going',
    //      excluding self-RSVP (creator RSVPs their own event).
    // Wrapped in try/catch — notification failure must NEVER break the RSVP flow.
    if (status === 'going') {
      try {
        if (event.createdBy.toString() !== userId.toString()) {
          const NotificationService = require('../notifications/notification.service');
          await NotificationService.createNotification({
            userId: event.createdBy,
            type: 'event_invite',
            title: 'New RSVP on your event',
            message: 'A member RSVP\'d to your event: ' + event.title,
            meta: {
              fromUserId: userId,
              eventId: event._id,
              communityId: event.communityId,
            },
          });
        }
      } catch (e) {
        logger.warn('event_invite notification failed (non-blocking): ' + e.message);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    logger.info('User ' + userId + ' RSVP ' + status + ' for event: ' + eventId);
    return event;
  }

  async cancelEvent(eventId, userId, userRole) {
    const event = await Event.findById(eventId);
    if (!event) throw Object.assign(new Error('Event not found'), { statusCode: 404 });

    const isCreator = event.createdBy.toString() === userId.toString();
    const isAdmin = ['admin', 'super_admin'].includes(userRole);

    if (!isCreator && !isAdmin) {
      throw Object.assign(new Error('Only the event creator or admin can cancel events'), { statusCode: 403 });
    }

    event.isCancelled = true;
    await event.save();

    // Notify all RSVP'd users about cancellation
    try {
      const NotificationService = require('../notifications/notification.service');
      const goingUsers = event.rsvpList.filter(r => r.status === 'going');

      for (const rsvp of goingUsers) {
        await NotificationService.createNotification({
          userId: rsvp.userId,
          type: 'event_cancelled',
          title: 'Event cancelled: ' + event.title,
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

  /**
   * Document requirement: Calendar sync
   * Returns Google Calendar, Outlook, and Yahoo calendar links for an event
   */
  async getCalendarLinks(eventId) {
    const event = await Event.findById(eventId);
    if (!event || !event.isActive) throw Object.assign(new Error('Event not found'), { statusCode: 404 });

    const calendarService = require('./calendar.service');
    return calendarService.getCalendarLinks(event);
  }

  /**
   * Document requirement: iCal download
   * Returns raw iCal (.ics) string for calendar import
   */
  async getIcal(eventId) {
    const event = await Event.findById(eventId);
    if (!event || !event.isActive) throw Object.assign(new Error('Event not found'), { statusCode: 404 });

    const calendarService = require('./calendar.service');
    return {
      ical: calendarService.generateIcal(event),
      filename: event.title.replace(/\s+/g, '-').toLowerCase() + '.ics',
    };
  }
}

module.exports = new EventService();