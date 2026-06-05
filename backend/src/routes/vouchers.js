'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/vouchersController');
const authMw = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');

router.use(authMw);

const view   = requirePermission('voucher.view');
const create = requirePermission('voucher.create');
const edit   = requirePermission('voucher.edit');
const del    = requirePermission('voucher.delete');

// Daybook list is gated on `daybook.view` — it's the page's own data.
// Voucher CRUD on rows still requires voucher.* (handled in DaybookScreen UI).
const daybookView = requirePermission(['daybook.view', 'voucher.view']);
// Other-ledgers feeds the Other Ledgers screen (a child of Ledger Master)
// AND the Vouchers ledger picker. Allow either page's view perm.
const otherLedgersView = requirePermission(['ledgermaster.view', 'voucher.view']);

// Specific paths must come before /:id so they don't get parsed as ids.
router.get('/next-no',       view,             ctrl.nextNo);
router.get('/pending-refs',  view,             ctrl.pendingRefs);
router.get('/daybook',       daybookView,      ctrl.daybook);
router.get('/other-ledgers', otherLedgersView, ctrl.otherLedgers);
router.get('/ledger-search', view,             ctrl.ledgerSearch);
router.get('/bilty-vehicle-ledger', view,      ctrl.biltyVehicleLedger);
router.get('/bilty-budget',         view,      ctrl.biltyBudget);

router.get('/',       view,   ctrl.list);
router.post('/',      create, ctrl.create);
router.get('/:id',    view,   ctrl.get);
router.put('/:id',    edit,   ctrl.update);
router.delete('/:id', del,    ctrl.remove);

module.exports = router;
