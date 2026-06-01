'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/usersController');
const authMw = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');

router.use(authMw);

// Per-page CRUD on the Users admin page.
router.get('/',                  requirePermission('user.view'),   ctrl.list);
router.get('/:id',               requirePermission('user.view'),   ctrl.get);
router.post('/',                 requirePermission('user.create'), ctrl.create);
router.patch('/:id',             requirePermission('user.edit'),   ctrl.update);
router.delete('/:id',            requirePermission('user.delete'), ctrl.remove);
// Activate / deactivate are state edits on an existing user → edit perm.
router.post('/:id/deactivate',   requirePermission('user.edit'),   ctrl.deactivate);
router.post('/:id/activate',     requirePermission('user.edit'),   ctrl.activate);

module.exports = router;
