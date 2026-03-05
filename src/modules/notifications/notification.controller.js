const notificationService = require('./notification.service');
const ApiResponse = require('../../utils/apiResponse');

class NotificationController {

  async getMyNotifications(req, res, next) {
    try {
      const { page, limit, unreadOnly } = req.query;
      const result = await notificationService.getUserNotifications(
        req.user._id, { page, limit, unreadOnly: unreadOnly === 'true' }
      );
      return ApiResponse.success(res, result, 'Notifications fetched');
    } catch (error) { next(error); }
  }

  async getUnreadCount(req, res, next) {
    try {
      const result = await notificationService.getUnreadCount(req.user._id);
      return ApiResponse.success(res, result, 'Unread count fetched');
    } catch (error) { next(error); }
  }

  async markAsRead(req, res, next) {
    try {
      const notification = await notificationService.markAsRead(
        req.params.id, req.user._id
      );
      return ApiResponse.success(res, { notification }, 'Marked as read');
    } catch (error) { next(error); }
  }

  async markAllAsRead(req, res, next) {
    try {
      const result = await notificationService.markAllAsRead(req.user._id);
      return ApiResponse.success(res, result, result.message);
    } catch (error) { next(error); }
  }

  async delete(req, res, next) {
    try {
      const result = await notificationService.deleteNotification(
        req.params.id, req.user._id
      );
      return ApiResponse.success(res, result, result.message);
    } catch (error) { next(error); }
  }
}

module.exports = new NotificationController();