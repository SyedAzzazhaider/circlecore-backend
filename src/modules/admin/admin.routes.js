const express         = require('express');
const router          = express.Router();
const adminController = require('./admin.controller');
const { authenticate, authorize } = require('../../middleware/authenticate');
const { checkSessionTimeout }     = require('../../middleware/sessionTimeout');

/**
 * Admin Routes — Platform User Management
 *
 * CC-27 FIX: Admin API created.
 *
 * Authorization tiers:
 *   adminOnly  → role: admin OR super_admin
 *   superOnly  → role: super_admin ONLY
 *
 * The authorize() middleware is already exported from authenticate.js —
 * no new middleware needed.
 *
 * Route design rationale:
 *   GET /users          → read-only, safe for all admins
 *   GET /users/:id      → read-only, safe for all admins
 *   PATCH /users/:id/role → HIGH IMPACT — super_admin only
 *     Reason: Granting 'admin' role to a user gives them access to this
 *     same admin panel. Restricting role changes to super_admin prevents
 *     an admin from elevating themselves or others without oversight.
 */

const adminOnly = [authenticate, checkSessionTimeout, authorize('admin', 'super_admin')];
const superOnly = [authenticate, checkSessionTimeout, authorize('super_admin')];

// GET  /api/admin/users              — list all users (paginated, filterable)
router.get('/users',
  ...adminOnly,
  adminController.getUsers.bind(adminController)
);

// GET  /api/admin/users/:id          — get single user detail
router.get('/users/:id',
  ...adminOnly,
  adminController.getUserById.bind(adminController)
);

// PATCH /api/admin/users/:id/role    — change user role
router.patch('/users/:id/role',
  ...superOnly,
  adminController.changeUserRole.bind(adminController)
);

module.exports = router;
