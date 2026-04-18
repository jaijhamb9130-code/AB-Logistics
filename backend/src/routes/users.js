'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/usersController');
const authMw = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

// T-01-10 / T-02-01 mitigation: admin-only for every /api/users/* route.
// Applied at the router level so no sub-route can accidentally bypass it.
router.use(authMw, requireRole('admin'));

router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/', ctrl.create);
router.patch('/:id', ctrl.update);
router.post('/:id/deactivate', ctrl.deactivate);

module.exports = router;
