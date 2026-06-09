'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/reportsController');
const authMw = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');

router.use(authMw);

router.get('/summary',          ctrl.getSummary);
router.get('/bilty-register',   requirePermission(['bilty.view']),   ctrl.getBiltyRegister);
router.get('/voucher-register', requirePermission(['voucher.view']), ctrl.getVoucherRegister);
router.get('/ledger-statement', requirePermission(['voucher.view']), ctrl.getLedgerStatement);
router.get('/group-summary',    requirePermission(['voucher.view']), ctrl.getGroupSummary);
router.get('/group-ledgers',    requirePermission(['voucher.view']), ctrl.getGroupLedgers);

module.exports = router;
