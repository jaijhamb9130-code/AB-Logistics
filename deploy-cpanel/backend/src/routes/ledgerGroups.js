'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/ledgerGroupController');
const authMw = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');

router.use(authMw);

// Read access is needed by every ledger sub-page (Customers / Owner / Agent /
// Other Ledgers all do a name → id lookup against this table on mount). So
// any master.view perm grants read access; CRUD on the group itself still
// strictly requires ledgergroup.*.
const groupReaders = [
  'ledgergroup.view',
  'ledgermaster.view',
  'customermaster.view',
  'ownermaster.view',
  'agentmaster.view',
];

router.post('/sync',  requirePermission('ledgergroup.edit'),   ctrl.sync);
router.get('/search', requirePermission(groupReaders),         ctrl.search);
router.get('/',       requirePermission(groupReaders),         ctrl.list);
router.get('/:id',    requirePermission(groupReaders),         ctrl.get);
router.post('/',      requirePermission('ledgergroup.create'), ctrl.create);
router.put('/:id',    requirePermission('ledgergroup.edit'),   ctrl.update);
router.delete('/:id', requirePermission('ledgergroup.delete'), ctrl.remove);

module.exports = router;
