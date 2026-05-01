'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/vchTypeController');
const authMw = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');

router.use(authMw);

router.get('/',     requirePermission('voucher.edit'), ctrl.list);
router.get('/:id',  requirePermission('voucher.edit'), ctrl.get);
router.post('/',    requirePermission('voucher.edit'), ctrl.create);
router.put('/:id',  requirePermission('voucher.edit'), ctrl.update);
router.delete('/:id', requirePermission('voucher.edit'), ctrl.remove);

module.exports = router;
