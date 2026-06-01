'use strict';

/**
 * Reports routes — only `/summary` survives. Powers dashboard tile counts
 * (bilties, freight memos, ledger groups, active users). Each stat is
 * filtered inside the controller against the caller's per-page perms.
 *
 * No router-level permission gate — every authenticated user gets a
 * personalised summary based on what they're allowed to see. Stats they
 * lack permission for return zero.
 */

const router = require('express').Router();
const ctrl = require('../controllers/reportsController');
const authMw = require('../middleware/authMiddleware');

router.use(authMw);

router.get('/summary', ctrl.getSummary);

module.exports = router;
