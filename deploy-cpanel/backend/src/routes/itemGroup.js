'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/itemGroupController');
const authMw = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');

router.use(authMw);

// Distinct permission for Item Group master.
router.get('/search',  requirePermission('itemgroup.view'),   ctrl.search);
router.get('/',        requirePermission('itemgroup.view'),   ctrl.list);
router.get('/:id',     requirePermission('itemgroup.view'),   ctrl.get);
router.post('/',       requirePermission('itemgroup.create'), ctrl.create);
router.put('/:id',     requirePermission('itemgroup.edit'),   ctrl.update);
router.delete('/:id',  requirePermission('itemgroup.delete'), ctrl.remove);

module.exports = router;
