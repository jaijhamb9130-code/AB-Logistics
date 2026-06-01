'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/authController');
const authMw = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { loginLimiter } = require('../middleware/rateLimit');

router.post('/login', loginLimiter, ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/logout', ctrl.logout);
router.get('/me', authMw, ctrl.me);

// Internal test endpoint used by role-middleware test suite.
// Kept under /api/auth to avoid adding new public surface.
router.get('/_admin-only-test', authMw, requireRole('admin'), (_req, res) => {
  res.status(200).json({ ok: true });
});

module.exports = router;
