'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/ownerController');
const authMw = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');

router.use(authMw);

router.get('/search', requirePermission('ownermaster.view'),   ctrl.search);
router.get('/',       requirePermission('ownermaster.view'),   ctrl.list);
router.get('/:id',    requirePermission('ownermaster.view'),   ctrl.get);
router.post('/',      requirePermission('ownermaster.create'), ctrl.create);
router.put('/:id',    requirePermission('ownermaster.edit'),   ctrl.update);
router.delete('/:id', requirePermission('ownermaster.delete'), ctrl.remove);

module.exports = router;
