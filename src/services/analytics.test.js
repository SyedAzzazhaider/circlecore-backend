const analyticsService = require('./analytics.service');

// Mock mixpanel before service loads
jest.mock('mixpanel', () => ({
  init: jest.fn().mockReturnValue({
    track:  jest.fn(),
    people: { set: jest.fn() },
  }),
}), { virtual: true });

beforeEach(() => jest.clearAllMocks());

describe('AnalyticsService — disabled when MIXPANEL_TOKEN not set', () => {
  it('does not throw when token is absent', () => {
    delete process.env.MIXPANEL_TOKEN;
    expect(() => analyticsService.track('test_event', 'user1')).not.toThrow();
  });
});

describe('AnalyticsService.track()', () => {
  it('does not throw when called with valid args', () => {
    expect(() => analyticsService.track('user_signed_up', 'user123', { email: 'a@b.com' }))
      .not.toThrow();
  });

  it('does not throw when distinctId is null', () => {
    expect(() => analyticsService.track('user_logged_in', null)).not.toThrow();
  });
});

describe('AnalyticsService convenience methods', () => {
  it('userSignedUp does not throw', () => {
    expect(() => analyticsService.userSignedUp('user1', { email: 'a@b.com', name: 'Test' }))
      .not.toThrow();
  });

  it('userLoggedIn does not throw', () => {
    expect(() => analyticsService.userLoggedIn('user1', { email: 'a@b.com' }))
      .not.toThrow();
  });

  it('subscriptionStarted does not throw', () => {
    expect(() => analyticsService.subscriptionStarted('user1', { tier: 'premium', gateway: 'stripe' }))
      .not.toThrow();
  });

  it('subscriptionCancelled does not throw', () => {
    expect(() => analyticsService.subscriptionCancelled('user1', {})).not.toThrow();
  });

  it('postCreated does not throw', () => {
    expect(() => analyticsService.postCreated('user1', { communityId: 'c1' })).not.toThrow();
  });

  it('eventRsvp does not throw', () => {
    expect(() => analyticsService.eventRsvp('user1', { eventId: 'e1', status: 'going' }))
      .not.toThrow();
  });

  it('communityJoined does not throw', () => {
    expect(() => analyticsService.communityJoined('user1', { communityId: 'c1' }))
      .not.toThrow();
  });
});