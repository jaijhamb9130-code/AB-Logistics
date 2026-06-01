'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/biltyController');
const authMw = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validate');
const { CreateBiltySchema } = require('../schemas/bilty.schema');

router.use(authMw);

// Per-page CRUD: GET → view, POST → create, PATCH/PUT → edit, DELETE → delete.
// Bilties ARE vouchers, so voucher.* perms count as a fallback. Lets a
// daybook-only staff member edit a bilty row via the daybook pencil.
router.get('/next-no', requirePermission(['bilty.view', 'voucher.view', 'bilty.create', 'voucher.create']), ctrl.nextNo);
router.get('/by-no/:no', requirePermission(['bilty.view', 'voucher.view']),  ctrl.idByNo);
router.get('/',     requirePermission(['bilty.view', 'voucher.view']),       ctrl.list);
router.get('/:id',  requirePermission(['bilty.view', 'voucher.view']),       ctrl.get);
router.post('/',    requirePermission(['bilty.create', 'voucher.create']),   validate(CreateBiltySchema), ctrl.create);
router.patch('/:id', requirePermission(['bilty.edit', 'voucher.edit']),      validate(CreateBiltySchema), ctrl.update);
router.delete('/:id', requirePermission(['bilty.delete', 'voucher.delete']), ctrl.remove);

module.exports = router;
