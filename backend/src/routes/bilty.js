'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/biltyController');
const authMw = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validate');
const { CreateBiltySchema } = require('../schemas/bilty.schema');

router.use(authMw);

router.get('/', requirePermission('bilty.read'), ctrl.list);
router.get('/:id', requirePermission('bilty.read'), ctrl.get);
router.post('/', requirePermission('bilty.edit'), validate(CreateBiltySchema), ctrl.create);
router.patch('/:id', requirePermission('bilty.edit'), validate(CreateBiltySchema), ctrl.update);

module.exports = router;
