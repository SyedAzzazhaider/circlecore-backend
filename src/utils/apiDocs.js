/**
 * API Documentation — Swagger / OpenAPI 3.0
 *
 * CC-30 FIX: API documentation was entirely absent.
 * Without docs, every frontend developer or third-party integration
 * has to read source code to understand the API contract.
 *
 * This sets up Swagger UI at /api/docs — available in development only.
 * In production, /api/docs returns 404 (security best practice).
 *
 * Usage in app.js:
 *   const { setupApiDocs } = require('./utils/apiDocs');
 *   setupApiDocs(app);
 *
 * Access: http://localhost:5000/api/docs
 */
const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title:       'CircleCore API',
    version:     '1.0.0',
    description: 'Invite-only niche community platform API',
    contact: {
      name:  'CircleCore Team',
      email: process.env.ADMIN_EMAIL || 'admin@circlecore.app',
    },
  },
  servers: [
    { url: 'http://localhost:5000',        description: 'Local development' },
    { url: 'http://15.207.144.166',        description: 'Production (EC2)' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type:   'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token from POST /api/auth/login',
      },
    },
    schemas: {
      PaginatedResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          data:    { type: 'object' },
          message: { type: 'string' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
        },
      },
    },
  },
  security: [{ BearerAuth: [] }],
  tags: [
    { name: 'Auth',          description: 'Register, login, 2FA, OAuth, invite codes' },
    { name: 'Profiles',      description: 'User profiles, reputation, badges' },
    { name: 'Communities',   description: 'Community CRUD, join/leave, channels' },
    { name: 'Posts',         description: 'Posts, feed, reactions, polls, tags' },
    { name: 'Comments',      description: 'Comments, replies, helpful votes' },
    { name: 'Events',        description: 'Event creation, RSVP, calendar sync' },
    { name: 'Notifications', description: 'Real-time notifications, read state' },
    { name: 'Search',        description: 'Global search, communities, posts' },
    { name: 'Billing',       description: 'Stripe + Razorpay subscriptions, invoices' },
    { name: 'Moderation',    description: 'Flags, warnings, bans, audit log' },
    { name: 'Upload',        description: 'S3 file uploads, presigned URLs' },
    { name: 'GDPR',          description: 'Data export, account deletion, email consent' },
    { name: 'Health',        description: 'Service health check' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'], summary: 'Service health check',
        security: [],
        responses: {
          200: { description: 'All services healthy' },
          503: { description: 'One or more services degraded' },
        },
      },
    },
    '/api/auth/register': {
      post: {
        tags: ['Auth'], summary: 'Register a new user',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password', 'inviteCode'],
                properties: {
                  name:       { type: 'string', example: 'Jane Doe' },
                  email:      { type: 'string', format: 'email' },
                  password:   { type: 'string', minLength: 8 },
                  inviteCode: { type: 'string', example: 'ABCDE-FGHIJ' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'User registered successfully' },
          400: { description: 'Validation error' },
          409: { description: 'Email already in use' },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'], summary: 'Login with email + password',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email:    { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Login successful — returns accessToken + refreshToken' },
          200.1: { description: '2FA required — returns twoFactorTempToken (no full token yet)' },
          401: { description: 'Invalid credentials' },
          423: { description: 'Account locked (too many failed attempts)' },
        },
      },
    },
    '/api/auth/2fa/setup': {
      post: {
        tags: ['Auth'], summary: 'Initiate 2FA setup — returns QR code + secret',
        responses: { 200: { description: 'QR code PNG (base64) + secret returned' } },
      },
    },
    '/api/auth/2fa/enable': {
      post: {
        tags: ['Auth'], summary: 'Confirm 2FA setup with first TOTP code',
        responses: {
          200: { description: '2FA enabled — backup codes returned (shown ONCE only)' },
          400: { description: 'Invalid TOTP code' },
        },
      },
    },
    '/api/posts/feed': {
      get: {
        tags: ['Posts'], summary: 'Unified home feed — posts from all joined communities',
        parameters: [
          { name: 'page',  in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: { 200: { description: 'Paginated feed of posts' } },
      },
    },
    '/api/posts': {
      post: {
        tags: ['Posts'], summary: 'Create a post',
        responses: { 201: { description: 'Post created' } },
      },
    },
    '/api/posts/{id}/reply': {
      post: {
        tags: ['Posts'], summary: 'Reply to a post (creates comment)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Reply created' } },
      },
    },
    '/api/events': {
      get: {
        tags: ['Events'], summary: 'Global event discovery — all upcoming events',
        security: [],
        parameters: [
          { name: 'page',        in: 'query', schema: { type: 'integer' } },
          { name: 'limit',       in: 'query', schema: { type: 'integer' } },
          { name: 'type',        in: 'query', schema: { type: 'string', enum: ['online','webinar','meetup','workshop','other'] } },
          { name: 'communityId', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Paginated upcoming events' } },
      },
    },
    '/api/gdpr/email-preferences': {
      post: {
        tags: ['GDPR'], summary: 'Update email digest opt-in preference',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['emailOptIn'],
                properties: { emailOptIn: { type: 'boolean' } },
              },
            },
          },
        },
        responses: { 200: { description: 'Email preference updated' } },
      },
    },
    '/api/gdpr/export': {
      get: {
        tags: ['GDPR'], summary: 'Download all your data (GDPR Article 15)',
        responses: { 200: { description: 'JSON file download with all user data' } },
      },
    },
    '/api/gdpr/delete-account': {
      delete: {
        tags: ['GDPR'], summary: 'Permanently delete account (GDPR Article 17)',
        responses: { 200: { description: 'Account and all data deleted' } },
      },
    },
    '/api/search': {
      get: {
        tags: ['Search'], summary: 'Global search across users, communities, posts, events',
        parameters: [
          { name: 'q',     in: 'query', required: true, schema: { type: 'string', minLength: 2 } },
          { name: 'page',  in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'Search results by category' } },
      },
    },
    '/api/billing/subscribe/stripe': {
      post: {
        tags: ['Billing'], summary: 'Create Stripe subscription checkout session',
        responses: { 200: { description: 'Stripe checkout URL returned' } },
      },
    },
    '/api/billing/subscribe/razorpay': {
      post: {
        tags: ['Billing'], summary: 'Create Razorpay subscription',
        responses: { 200: { description: 'Razorpay subscription details returned' } },
      },
    },
  },
};

/**
 * Mount Swagger UI — development only
 * In production SENTRY_DSN etc. may be set but swagger remains disabled
 */
const setupApiDocs = (app) => {
  if (process.env.NODE_ENV === 'production') {
    // Explicitly block /api/docs in production — return 404
    app.use('/api/docs', (req, res) => {
      res.status(404).json({ success: false, message: 'Not found' });
    });
    return;
  }

  try {
    const swaggerUi = require('swagger-ui-express');
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
      customSiteTitle: 'CircleCore API Docs',
      customCss: '.swagger-ui .topbar { display: none }',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
      },
    }));
    const logger = require('./logger');
    logger.info('Swagger UI available at /api/docs');
  } catch (e) {
    // swagger-ui-express not installed — log warning and skip
    console.warn('[API DOCS] swagger-ui-express not installed. Run: npm install swagger-ui-express');
    console.warn('[API DOCS] API documentation will not be available at /api/docs');
  }
};

module.exports = { setupApiDocs, swaggerSpec };
