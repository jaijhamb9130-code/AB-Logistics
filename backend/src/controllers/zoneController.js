'use strict';

const zoneModel = require('../models/zoneModel');
const { isNonEmptyString, parseId } = require('../utils/validators');

exports.list = async (_req, res, next) => {
  try {
    const rows = await zoneModel.findAll();
    return res.status(200).json(rows);
  } catch (err) { return next(err); }
};

exports.search = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length === 0) return res.status(200).json([]);
    const rows = await zoneModel.search(q);
    return res.status(200).json(rows);
  } catch (err) { return next(err); }
};

exports.get = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });
    const row = await zoneModel.findById(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json(row);
  } catch (err) { return next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!isNonEmptyString(body.name)) return res.status(400).json({ error: 'invalid_name' });
    const userId = req.user ? req.user.id : null;
    const { id } = await zoneModel.create({
      name: body.name,
      description: body.description,
      userId,
    });
    return res.status(201).json({ id });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'name_taken',
        message: `Zone '${(req.body && req.body.name) || ''}' already exists.`,
      });
    }
    return next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });
    const existing = await zoneModel.findById(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });

    const body = req.body || {};
    if (!isNonEmptyString(body.name)) return res.status(400).json({ error: 'invalid_name' });
    await zoneModel.update(id, { name: body.name, description: body.description });
    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        error: 'name_taken',
        message: `Zone '${(req.body && req.body.name) || ''}' already exists.`,
      });
    }
    return next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });
    const existing = await zoneModel.findById(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    const result = await zoneModel.deleteById(id);
    if (result && result.in_use) {
      return res.status(409).json({
        error: 'in_use',
        message: 'Zone is referenced by existing bilties.',
      });
    }
    if (!result || !result.affected) return res.status(404).json({ error: 'not_found' });
    return res.status(204).end();
  } catch (err) {
    if (err && err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({
        error: 'in_use',
        message: 'Zone is referenced by existing bilties.',
      });
    }
    return next(err);
  }
};
