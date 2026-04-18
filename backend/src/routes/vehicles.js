'use strict';

/**
 * Phase 5 — Vehicles routes (VEHICLE-01..03).
 * Bearer auth applied router-wide; per-route permission gates per read/edit.
 */

const router = require('express').Router();
const ctrl = require('../controllers/vehiclesController');
const authMw = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');

router.use(authMw);

router.get('/', requirePermission('vehicle.read'), ctrl.list);
router.get('/:id', requirePermission('vehicle.read'), ctrl.get);
router.post('/', requirePermission('vehicle.edit'), ctrl.create);
router.patch('/:id', requirePermission('vehicle.edit'), ctrl.update);
router.post('/:id/deactivate', requirePermission('vehicle.edit'), ctrl.deactivate);

module.exports = router;
