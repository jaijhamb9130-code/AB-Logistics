'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/itemMasterController');
const authMw = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');

router.use(authMw);

router.get('/search', requirePermission('itemmaster.view'),   ctrl.search);
router.get('/',       requirePermission('itemmaster.view'),   ctrl.list);
router.get('/:id',    requirePermission('itemmaster.view'),   ctrl.get);
router.post('/',      requirePermission('itemmaster.create'), ctrl.create);
router.put('/:id',    requirePermission('itemmaster.edit'),   ctrl.update);

module.exports = router;
