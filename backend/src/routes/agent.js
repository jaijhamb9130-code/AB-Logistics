'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/agentController');
const authMw = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');

router.use(authMw);

router.get('/search', requirePermission('agentmaster.view'),   ctrl.search);
router.get('/',       requirePermission('agentmaster.view'),   ctrl.list);
router.get('/:id',    requirePermission('agentmaster.view'),   ctrl.get);
router.post('/',      requirePermission('agentmaster.create'), ctrl.create);
router.put('/:id',    requirePermission('agentmaster.edit'),   ctrl.update);
router.delete('/:id', requirePermission('agentmaster.delete'), ctrl.remove);

module.exports = router;
