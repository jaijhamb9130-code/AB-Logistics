'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/branchController');
const authMw = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');

router.use(authMw);

router.get('/search', requirePermission('branchmaster.view'),   ctrl.search);
router.get('/',       requirePermission('branchmaster.view'),   ctrl.list);
router.get('/:id',    requirePermission('branchmaster.view'),   ctrl.get);
router.post('/',      requirePermission('branchmaster.create'), ctrl.create);
router.put('/:id',    requirePermission('branchmaster.edit'),   ctrl.update);
router.delete('/:id', requirePermission('branchmaster.delete'), ctrl.remove);

module.exports = router;
