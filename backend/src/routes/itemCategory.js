'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/itemCategoryController');
const authMw = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');

router.use(authMw);

// Distinct permission for Item Category master.
router.get('/search',  requirePermission('itemcategory.view'),   ctrl.search);
router.get('/',        requirePermission('itemcategory.view'),   ctrl.list);
router.get('/:id',     requirePermission('itemcategory.view'),   ctrl.get);
router.post('/',       requirePermission('itemcategory.create'), ctrl.create);
router.put('/:id',     requirePermission('itemcategory.edit'),   ctrl.update);
router.delete('/:id',  requirePermission('itemcategory.delete'), ctrl.remove);

module.exports = router;
