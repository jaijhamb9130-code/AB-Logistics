'use strict';

/**
 * Phase 6 — Reports routes (REPORT-01..03).
 * Bearer auth applied router-wide. Per-stat permission gating happens
 * inside the controller (partial visibility for staff).
 */

const router = require('express').Router();
const ctrl = require('../controllers/reportsController');
const authMw = require('../middleware/authMiddleware');

router.use(authMw);

router.get('/summary', ctrl.getSummary);
router.get('/history', ctrl.getHistory);

module.exports = router;
