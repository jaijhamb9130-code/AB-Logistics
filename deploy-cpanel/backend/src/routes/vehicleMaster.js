'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/vehicleMasterController');
const authMw = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');

router.use(authMw);

router.post('/sync',  requirePermission('vehiclemaster.edit'),   ctrl.sync);
router.get('/search', requirePermission('vehiclemaster.view'),   ctrl.search);
router.get('/',       requirePermission('vehiclemaster.view'),   ctrl.list);
router.get('/:id',    requirePermission('vehiclemaster.view'),   ctrl.get);
router.post('/',      requirePermission('vehiclemaster.create'), ctrl.create);
router.put('/:id',    requirePermission('vehiclemaster.edit'),   ctrl.update);
router.delete('/:id', requirePermission('vehiclemaster.delete'), ctrl.remove);

module.exports = router;
