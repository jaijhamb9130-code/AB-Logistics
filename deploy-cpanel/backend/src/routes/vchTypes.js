'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/vchTypeController');
const authMw = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');

router.use(authMw);

// Voucher types are administrative metadata for the Vouchers page — share
// the `voucher.*` permission family.
router.get('/',       requirePermission('voucher.view'),   ctrl.list);
router.get('/:id',    requirePermission('voucher.view'),   ctrl.get);
router.post('/',      requirePermission('voucher.create'), ctrl.create);
router.put('/:id',    requirePermission('voucher.edit'),   ctrl.update);
router.delete('/:id', requirePermission('voucher.delete'), ctrl.remove);

module.exports = router;
