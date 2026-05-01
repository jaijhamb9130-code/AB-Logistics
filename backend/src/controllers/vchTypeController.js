'use strict';

const vchTypeModel = require('../models/vchTypeModel');
const { isNonEmptyString, parseId } = require('../utils/validators');

const VALID_DEEMED = new Set(['YES', 'NO']);

function validateBody(body) {
  if (!isNonEmptyString(body.name)) return 'invalid_name';
  if (body.deemed_positive != null && body.deemed_positive !== ''
      && !VALID_DEEMED.has(body.deemed_positive)) {
    return 'invalid_deemed_positive';
  }
  return null;
}

// GET /api/vch-types
exports.list = async (_req, res, next) => {
  try {
    const rows = await vchTypeModel.findAll();
    return res.status(200).json(rows);
  } catch (err) { return next(err); }
};

// GET /api/vch-types/:id
exports.get = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });
    const row = await vchTypeModel.findById(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json(row);
  } catch (err) { return next(err); }
};

// POST /api/vch-types
exports.create = async (req, res, next) => {
  try {
    const body = req.body || {};
    const err = validateBody(body);
    if (err) return res.status(400).json({ error: err });
    const { id } = await vchTypeModel.create(body);
    return res.status(201).json({ id });
  } catch (err) { return next(err); }
};

// PUT /api/vch-types/:id
exports.update = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });
    const existing = await vchTypeModel.findById(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    if (existing.is_system) return res.status(403).json({ error: 'system_type_immutable' });
    const body = req.body || {};
    if (body.name !== undefined && !isNonEmptyString(body.name)) {
      return res.status(400).json({ error: 'invalid_name' });
    }
    if (body.deemed_positive !== undefined && body.deemed_positive !== null
        && body.deemed_positive !== '' && !VALID_DEEMED.has(body.deemed_positive)) {
      return res.status(400).json({ error: 'invalid_deemed_positive' });
    }
    await vchTypeModel.update(id, body);
    return res.status(200).json({ ok: true });
  } catch (err) { return next(err); }
};

// DELETE /api/vch-types/:id
exports.remove = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });
    const existing = await vchTypeModel.findById(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    if (existing.is_system) return res.status(403).json({ error: 'system_type_immutable' });
    await vchTypeModel.remove(id);
    return res.status(204).end();
  } catch (err) { return next(err); }
};
