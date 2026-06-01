'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/ledgerMasterController');
const authMw = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');

router.use(authMw);

const masters = ['ledgermaster', 'customermaster', 'ownermaster', 'agentmaster'];
const view   = requirePermission(masters.map(m => `${m}.view`));
const create = requirePermission(masters.map(m => `${m}.create`));
const edit   = requirePermission(masters.map(m => `${m}.edit`));
const del    = requirePermission(masters.map(m => `${m}.delete`));

// Customers / Owner / Agent / Other Ledgers — shared routes.
router.get('/search', view, ctrl.search);
router.get('/', view, ctrl.list);
router.get('/:id', view, ctrl.get);
router.post('/', create, ctrl.create);
router.put('/:id', edit, ctrl.update);
router.delete('/:id', del, ctrl.delete);

module.exports = router;
