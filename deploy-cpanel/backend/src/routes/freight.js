'use strict';

/**
 * Phase 4 — Freight Memo routes.
 *
 * Bearer auth applied router-wide; per-route permission gates follow the
 * per-page CRUD model:
 *   - read paths   → freight.view
 *   - generate     → freight.create   (creates a memo from a bilty)
 */

const router = require('express').Router();
const ctrl = require('../controllers/freightController');
const authMw = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validate');
const { GenerateFreightSchema } = require('../schemas/freight.schema');

router.use(authMw);

router.post('/generate',         requirePermission('freight.create'), validate(GenerateFreightSchema), ctrl.generate);
router.get('/',                  requirePermission('freight.view'),   ctrl.list);
router.get('/by-bilty/:biltyId', requirePermission('freight.view'),   ctrl.getByBiltyId);
router.get('/:id',               requirePermission('freight.view'),   ctrl.get);

module.exports = router;
