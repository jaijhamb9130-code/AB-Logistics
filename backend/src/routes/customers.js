'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/customersController');
const authMw = require('../middleware/authMiddleware');

router.use(authMw);

// search must come before /:id so "search" isn't treated as an id param
router.get('/search', ctrl.search);
router.get('/', ctrl.list);
router.get('/:id', ctrl.get);
router.post('/', ctrl.create);

module.exports = router;
