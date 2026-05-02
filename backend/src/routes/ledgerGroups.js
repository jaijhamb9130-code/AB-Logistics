'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/ledgerGroupController');
const authMw = require('../middleware/authMiddleware');

router.use(authMw);

router.get('/search', ctrl.search);
router.post('/sync', ctrl.sync);
router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
