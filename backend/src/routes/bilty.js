'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/biltyController');
const authMw = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validate');
const { CreateBiltySchema } = require('../schemas/bilty.schema');

router.use(authMw);

router.get('/', requirePermission('bilty.edit'), ctrl.list);
router.get('/:id', requirePermission('bilty.edit'), ctrl.get);
router.post('/', requirePermission('bilty.edit'), validate(CreateBiltySchema), ctrl.create);
router.patch('/:id', requirePermission('bilty.edit'), validate(CreateBiltySchema), ctrl.update);

module.exports = router;
