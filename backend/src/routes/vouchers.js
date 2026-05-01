'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/vouchersController');
const authMw = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');

router.use(authMw);
const guard = requirePermission('voucher.edit');

// Specific paths must come before /:id so they don't get parsed as ids.
router.get('/next-no',       guard, ctrl.nextNo);
router.get('/pending-refs',  guard, ctrl.pendingRefs);
router.get('/daybook',       guard, ctrl.daybook);
router.get('/other-ledgers', guard, ctrl.otherLedgers);
router.get('/ledger-search', guard, ctrl.ledgerSearch);

router.get('/',       guard, ctrl.list);
router.post('/',      guard, ctrl.create);
router.get('/:id',    guard, ctrl.get);
router.put('/:id',    guard, ctrl.update);
router.delete('/:id', guard, ctrl.remove);

module.exports = router;
