'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/destinationController');
const authMw = require('../middleware/authMiddleware');

router.use(authMw);

// Specific routes before parameterized ones.
router.post('/sync', ctrl.sync);

// Branch helpers (distinct values from the single table)
router.get('/branches/search', ctrl.searchBranches);
router.get('/branches', ctrl.listBranches);

// From/To location autocomplete (filters by branch when provided)
router.get('/search', ctrl.searchLocations);

// Destination CRUD
router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);

module.exports = router;
