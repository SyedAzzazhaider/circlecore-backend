const logger = require('../../utils/logger');

/**
 * Calendar Service
 * Document requirement: MODULE E — Calendar sync
 * Generates iCal format for calendar export
 * Compatible with Google Calendar, Apple Calendar, Outlook
 */

class CalendarService {

  /**
   * Generate iCal string for a single event
   * iCal RFC 5545 compliant format
   */
  generateIcal(event) {
    const formatDate = (date) => {
      return new Date(date)
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}/, '');
    };

    const escapeText = (text) => {
      if (!text) return '';
      return text
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n');
    };

    const uid = event._id.toString() + '@circlecore.app';
    const now = formatDate(new Date());
    const start = formatDate(event.startDate);
    const end = formatDate(event.endDate);

    let location = '';
    if (event.location) {
      if (event.location.type === 'physical' && event.location.address) {
        location = 'LOCATION:' + escapeText(event.location.address);
      } else if (event.location.meetingUrl) {
        location = 'LOCATION:' + escapeText(event.location.meetingUrl);
      }
    }

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CircleCore//CircleCore Platform//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + uid,
      'DTSTAMP:' + now,
      'DTSTART:' + start,
      'DTEND:' + end,
      'SUMMARY:' + escapeText(event.title),
      'DESCRIPTION:' + escapeText(event.description),
      location,
      'STATUS:' + (event.isCancelled ? 'CANCELLED' : 'CONFIRMED'),
      'TRANSP:OPAQUE',
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter(line => line !== '');

    return lines.join('\r\n');
  }

  /**
   * Generate Google Calendar URL for an event
   * Opens Google Calendar with pre-filled event details
   */
  generateGoogleCalendarUrl(event) {
    const formatGoogleDate = (date) => {
      return new Date(date)
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z/, 'Z');
    };

    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: event.title,
      dates: formatGoogleDate(event.startDate) + '/' + formatGoogleDate(event.endDate),
      details: event.description || '',
      location: event.location?.address || event.location?.meetingUrl || '',
    });

    return 'https://calendar.google.com/calendar/render?' + params.toString();
  }

  /**
   * Generate Outlook calendar URL for an event
   */
  generateOutlookCalendarUrl(event) {
    const params = new URLSearchParams({
      subject: event.title,
      startdt: new Date(event.startDate).toISOString(),
      enddt: new Date(event.endDate).toISOString(),
      body: event.description || '',
      location: event.location?.address || event.location?.meetingUrl || '',
    });

    return 'https://outlook.live.com/calendar/0/deeplink/compose?' + params.toString();
  }

  /**
   * Return all calendar sync options for an event
   */
  getCalendarLinks(event) {
    return {
      icalDownloadPath: '/api/events/' + event._id + '/calendar/ical',
      googleCalendar: this.generateGoogleCalendarUrl(event),
      outlookCalendar: this.generateOutlookCalendarUrl(event),
    };
  }
}

module.exports = new CalendarService();