'use strict';

/**
 * Phase 4 — Freight Memo routes.
 *
 * Bearer auth applied router-wide; per-route permission gates follow the
 * read/write split:
 *   - read paths  → freight.access
 *   - generate    → bilty.edit (the side-effect is triggered by a user who
 *                   has write authority over the underlying bilty)
 */

const router = require('express').Router();
const ctrl = require('../controllers/freightController');
const authMw = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validate');
const { GenerateFreightSchema } = require('../schemas/freight.schema');

router.use(authMw);

router.post('/generate', requirePermission('bilty.edit'), validate(GenerateFreightSchema), ctrl.generate);
router.get('/', requirePermission('freight.access'), ctrl.list);
router.get('/by-bilty/:biltyId', requirePermission('freight.access'), ctrl.getByBiltyId);
router.get('/:id', requirePermission('freight.access'), ctrl.get);

module.exports = router;
