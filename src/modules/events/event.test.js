const eventService = require('./event.service');
const Event        = require('./event.model');
const Community    = require('../communities/community.model');

jest.mock('./event.model');
jest.mock('../communities/community.model');
jest.mock('../notifications/notification.service');

const mockCommunity = {
  _id:        'comm1',
  isMember:   jest.fn().mockReturnValue(true),
  getMemberRole: jest.fn().mockReturnValue('member'),
};

const mockEvent = {
  _id:          'event1',
  title:        'Test Event',
  isActive:     true,
  isCancelled:  false,
  maxAttendees: null,
  attendeeCount: 0,
  rsvpList:     [],
  communityId:  'comm1',
  createdBy:    'user1',
  save:         jest.fn().mockResolvedValue(true),
};

beforeEach(() => jest.clearAllMocks());

describe('EventService.createEvent()', () => {
  it('throws 404 if community not found', async () => {
    Community.findById.mockResolvedValue(null);
    await expect(eventService.createEvent({
      communityId: 'comm1', createdBy: 'user1',
      title: 'T', startDate: new Date(Date.now() + 1000),
      endDate: new Date(Date.now() + 2000),
    })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 403 if user is not a community member', async () => {
    Community.findById.mockResolvedValue({ ...mockCommunity, isMember: jest.fn().mockReturnValue(false) });
    await expect(eventService.createEvent({
      communityId: 'comm1', createdBy: 'user1',
      title: 'T', startDate: new Date(Date.now() + 1000),
      endDate: new Date(Date.now() + 2000),
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 400 if endDate is before startDate', async () => {
    Community.findById.mockResolvedValue(mockCommunity);
    await expect(eventService.createEvent({
      communityId: 'comm1', createdBy: 'user1',
      title: 'T',
      startDate: new Date(Date.now() + 2000),
      endDate:   new Date(Date.now() + 1000),
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('EventService.rsvpEvent()', () => {
  it('throws 404 if event not found', async () => {
    Event.findById.mockResolvedValue(null);
    await expect(eventService.rsvpEvent('event1', 'user1', 'going'))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 400 if event is cancelled', async () => {
    Event.findById.mockResolvedValue({ ...mockEvent, isCancelled: true });
    await expect(eventService.rsvpEvent('event1', 'user1', 'going'))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 if event is at full capacity', async () => {
    Event.findById.mockResolvedValue({
      ...mockEvent,
      maxAttendees:  1,
      attendeeCount: 1,
      rsvpList:      [],
    });
    await expect(eventService.rsvpEvent('event1', 'user1', 'going'))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('updates existing RSVP if user already responded', async () => {
    const event = {
      ...mockEvent,
      rsvpList: [{ userId: { toString: () => 'user1' }, status: 'maybe' }],
    };
    Event.findById.mockResolvedValue(event);
    await eventService.rsvpEvent('event1', 'user1', 'going');
    expect(event.rsvpList[0].status).toBe('going');
    expect(event.save).toHaveBeenCalled();
  });
});

describe('EventService.getAllUpcoming()', () => {
  it('returns paginated events', async () => {
    Event.countDocuments.mockResolvedValue(2);
    Event.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort:     jest.fn().mockReturnThis(),
      skip:     jest.fn().mockReturnThis(),
      limit:    jest.fn().mockResolvedValue([mockEvent, mockEvent]),
    });
    const result = await eventService.getAllUpcoming({ page: 1, limit: 2 });
    expect(result.events).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
  });
});