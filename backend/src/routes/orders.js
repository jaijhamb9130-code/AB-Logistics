'use strict';

/**
 * Phase 5 — Orders routes (ORDER-01..04).
 * Bearer auth applied router-wide; per-route permission gates per read/edit.
 */

const router = require('express').Router();
const ctrl = require('../controllers/ordersController');
const authMw = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');

router.use(authMw);

router.get('/', requirePermission('order.read'), ctrl.list);
router.get('/:id', requirePermission('order.read'), ctrl.get);
router.post('/', requirePermission('order.edit'), ctrl.create);
router.patch('/:id/status', requirePermission('order.edit'), ctrl.updateStatus);
router.patch('/:id/vehicle', requirePermission('order.edit'), ctrl.assignVehicle);

module.exports = router;
