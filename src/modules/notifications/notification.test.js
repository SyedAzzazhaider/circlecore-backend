const notificationService = require('./notification.service');
const Notification        = require('./notification.model');

jest.mock('./notification.model');

const mockNotification = {
  _id:     'notif1',
  userId:  'user1',
  type:    'event_invite',
  title:   'Test notification',
  isRead:  false,
  save:    jest.fn().mockResolvedValue(true),
};

beforeEach(() => jest.clearAllMocks());

describe('NotificationService.createNotification()', () => {
  it('creates and returns a notification', async () => {
    Notification.create.mockResolvedValue(mockNotification);
    const result = await notificationService.createNotification({
      userId:  'user1',
      type:    'event_invite',
      title:   'Test notification',
      message: 'You were invited',
    });
    expect(result).toMatchObject({ type: 'event_invite' });
    expect(Notification.create).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationService.getUserNotifications()', () => {
  it('returns paginated notifications', async () => {
    Notification.countDocuments.mockResolvedValue(3);
    Notification.find.mockReturnValue({
      sort:  jest.fn().mockReturnThis(),
      skip:  jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([mockNotification]),
    });
    const result = await notificationService.getUserNotifications('user1', { page: 1, limit: 10 });
    expect(result.notifications).toHaveLength(1);
    expect(result.pagination.total).toBe(3);
  });
});

describe('NotificationService.markAsRead()', () => {
  it('marks notification as read', async () => {
    Notification.findOneAndUpdate.mockResolvedValue({ ...mockNotification, isRead: true });
    const result = await notificationService.markAsRead('notif1', 'user1');
    expect(result.isRead).toBe(true);
  });

  it('throws 404 if notification not found', async () => {
    Notification.findOneAndUpdate.mockResolvedValue(null);
    await expect(notificationService.markAsRead('notif1', 'user1'))
      .rejects.toMatchObject({ statusCode: 404 });
  });
});