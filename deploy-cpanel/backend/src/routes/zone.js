'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/zoneController');
const authMw = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');

router.use(authMw);

router.get('/search', requirePermission('zonemaster.view'),   ctrl.search);
router.get('/',       requirePermission('zonemaster.view'),   ctrl.list);
router.get('/:id',    requirePermission('zonemaster.view'),   ctrl.get);
router.post('/',      requirePermission('zonemaster.create'), ctrl.create);
router.put('/:id',    requirePermission('zonemaster.edit'),   ctrl.update);
router.delete('/:id', requirePermission('zonemaster.delete'), ctrl.remove);

module.exports = router;
