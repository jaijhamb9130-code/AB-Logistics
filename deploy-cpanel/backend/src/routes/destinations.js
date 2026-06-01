'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/destinationController');
const authMw = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');

router.use(authMw);

// Specific routes before parameterized ones.
router.post('/sync',                requirePermission('destinationmaster.edit'),   ctrl.sync);

// Branch helpers — read-only views of distinct values.
router.get('/branches/search',      requirePermission('destinationmaster.view'),   ctrl.searchBranches);
router.get('/branches',             requirePermission('destinationmaster.view'),   ctrl.listBranches);

// From/To location autocomplete (filters by branch when provided).
router.get('/search',               requirePermission('destinationmaster.view'),   ctrl.searchLocations);

// Destination CRUD.
router.get('/',                     requirePermission('destinationmaster.view'),   ctrl.list);
router.get('/:id',                  requirePermission('destinationmaster.view'),   ctrl.get);
router.post('/',                    requirePermission('destinationmaster.create'), ctrl.create);
router.put('/:id',                  requirePermission('destinationmaster.edit'),   ctrl.update);
router.delete('/:id',               requirePermission('destinationmaster.delete'), ctrl.remove);

module.exports = router;
