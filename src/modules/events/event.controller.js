const eventService = require('./event.service');
const ApiResponse  = require('../../utils/apiResponse');

/**
 * Event Controller — MODULE D/E
 *
 * CC-08 FIX: getAll() — controller handler for GET /api/events
 *   Global platform-wide event discovery with optional filters.
 */

class EventController {

  // CC-08 FIX: Global event discovery
  // Supports: ?page, ?limit, ?type (online|in-person), ?communityId
  async getAll(req, res, next) {
    try {
      const { page, limit, type, communityId } = req.query;
      const result = await eventService.getAllUpcoming({ page, limit, type, communityId });
      return ApiResponse.success(res, result, 'Upcoming events fetched');
    } catch (error) { next(error); }
  }

  async create(req, res, next) {
    try {
      const { communityId, title, details, type, startDate, endDate, timezone, location, maxAttendees, tags } = req.body;
      const event = await eventService.createEvent({
        communityId, title, details, type,
        startDate, endDate, timezone, location,
        maxAttendees, tags,
        createdBy: req.user._id,
      });
      return ApiResponse.created(res, { event }, 'Event created successfully');
    } catch (error) { next(error); }
  }

  async getCommunityEvents(req, res, next) {
    try {
      const { page, limit, upcoming } = req.query;
      const result = await eventService.getCommunityEvents(
        req.params.communityId, { page, limit, upcoming: upcoming !== 'false' }
      );
      return ApiResponse.success(res, result, 'Community events fetched');
    } catch (error) { next(error); }
  }

  async getById(req, res, next) {
    try {
      const event = await eventService.getEventById(req.params.id);
      return ApiResponse.success(res, { event }, 'Event fetched');
    } catch (error) { next(error); }
  }

  async rsvp(req, res, next) {
    try {
      const { status } = req.body;
      const event = await eventService.rsvpEvent(req.params.id, req.user._id, status || 'going');
      return ApiResponse.success(res, { attendeeCount: event.attendeeCount }, 'RSVP updated');
    } catch (error) { next(error); }
  }

  async cancel(req, res, next) {
    try {
      const result = await eventService.cancelEvent(req.params.id, req.user._id, req.user.role);
      return ApiResponse.success(res, result, result.message);
    } catch (error) { next(error); }
  }

  async getMyRSVPs(req, res, next) {
    try {
      const events = await eventService.getMyRSVPs(req.user._id);
      return ApiResponse.success(res, { events }, 'Your RSVPs fetched');
    } catch (error) { next(error); }
  }

  async getCalendarLinks(req, res, next) {
    try {
      const links = await eventService.getCalendarLinks(req.params.id);
      return ApiResponse.success(res, links, 'Calendar links generated');
    } catch (error) { next(error); }
  }

  async inviteUser(req, res, next) {
    try {
      const { userId } = req.body;

      if (!userId) {
        return ApiResponse.badRequest(res, 'userId is required');
      }

      const result = await eventService.inviteToEvent(
        req.params.id,
        userId,
        req.user._id
      );

      return ApiResponse.success(res, result, result.message);
    } catch (error) { next(error); }
  }

  async downloadIcal(req, res, next) {
    try {
      const { ical, filename } = await eventService.getIcal(req.params.id);
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
      res.send(ical);
    } catch (error) { next(error); }
  }
}

module.exports = new EventController();
