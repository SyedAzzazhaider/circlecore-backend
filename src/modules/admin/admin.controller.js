const User        = require('../auth/auth.model');
const ApiResponse = require('../../utils/apiResponse');
const logger      = require('../../utils/logger');

/**
 * Admin Controller — Platform User Management
 *
 * CC-27 FIX: Admin user management API created.
 *
 * Previously: No API existed to view or manage users.
 * Promoting a user to moderator required direct MongoDB shell access.
 * On a live platform this is an operational blocker — every time you need
 * to add a moderator, ban a user, or investigate abuse you need DB access.
 *
 * Endpoints:
 *   GET    /api/admin/users              → paginated user list with filters
 *   GET    /api/admin/users/:id          → single user detail view
 *   PATCH  /api/admin/users/:id/role     → change role (super_admin only)
 *
 * Authorization:
 *   GET endpoints   → admin or super_admin
 *   PATCH /role     → super_admin only (role changes are high-impact)
 *
 * Security guardrails:
 *   - super_admin role cannot be changed via API (prevents accidental lockout)
 *   - Admin cannot demote themselves (prevents accidental self-lockout)
 *   - All role changes logged with who changed what and when
 */
class AdminController {

  // ─── GET /api/admin/users ──────────────────────────────────────────────────
  // Query params: page, limit, role, search (name/email), isSuspended
  async getUsers(req, res, next) {
    try {
      const {
        page = 1,
        limit = 20,
        role,
        search,
        isSuspended,
      } = req.query;

      const filter = {};

      if (role) filter.role = role;

      // isSuspended filter — only apply if explicitly passed as query param
      if (isSuspended !== undefined) {
        filter.isSuspended = isSuspended === 'true';
      }

      // Search by name or email — escape regex special chars to prevent ReDoS
      if (search) {
        const regex = new RegExp(
          search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'i'
        );
        filter.$or = [{ name: regex }, { email: regex }];
      }

      const skip  = (parseInt(page) - 1) * parseInt(limit);
      const total = await User.countDocuments(filter);
      const users = await User.find(filter)
        .select('name email role isSuspended suspendedReason isEmailVerified createdAt lastLogin twoFactorEnabled')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      return ApiResponse.success(res, {
        users,
        pagination: {
          total,
          page:  parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
      }, 'Users fetched');

    } catch (error) { next(error); }
  }

  // ─── GET /api/admin/users/:id ──────────────────────────────────────────────
  async getUserById(req, res, next) {
    try {
      const user = await User.findById(req.params.id)
        .select('name email role isSuspended suspendedReason suspendedUntil isEmailVerified createdAt lastLogin twoFactorEnabled warningCount emailOptIn');

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      return ApiResponse.success(res, user, 'User fetched');
    } catch (error) { next(error); }
  }

  // ─── PATCH /api/admin/users/:id/role ──────────────────────────────────────
  // super_admin only — role changes are high-impact and auditable
  async changeUserRole(req, res, next) {
    try {
      const { role } = req.body;
      const validRoles = ['member', 'moderator', 'admin'];

      if (!role || !validRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          message: 'role must be one of: member, moderator, admin',
        });
      }

      const target = await User.findById(req.params.id).select('role email name');

      if (!target) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Prevent super_admin from being changed via API — must be done in DB
      // This prevents an accidental demotion from locking out the platform owner
      if (target.role === 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'super_admin role cannot be changed via API — use DB directly',
        });
      }

      // Prevent self role change — prevents accidental self-demotion
      if (req.user._id.toString() === req.params.id) {
        return res.status(400).json({
          success: false,
          message: 'You cannot change your own role',
        });
      }

      const previousRole = target.role;
      target.role = role;
      await target.save();

      logger.info(
        `[ADMIN] Role changed: ${target.email} ${previousRole} → ${role}` +
        ` | by: ${req.user.email} (${req.user._id})`
      );

      return ApiResponse.success(res, {
        userId:       target._id,
        name:         target.name,
        email:        target.email,
        role:         target.role,
        previousRole,
      }, `User role updated to ${role}`);

    } catch (error) { next(error); }
  }
}

module.exports = new AdminController();
