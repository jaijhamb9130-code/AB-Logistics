'use strict';

const itemMasterModel = require('../models/itemMasterModel');
const { isNonEmptyString, parseId } = require('../utils/validators');

function validateGstRate(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) return 'invalid_gst_rate';
  return null;
}

function validateBody(body) {
  if (!isNonEmptyString(body.name)) return 'invalid_name';
  return validateGstRate(body.gst_rate);
}

exports.list = async (_req, res, next) => {
  try {
    const rows = await itemMasterModel.findAll();
    return res.status(200).json(rows);
  } catch (err) { return next(err); }
};

exports.search = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length === 0) return res.status(200).json([]);
    const rows = await itemMasterModel.search(q);
    return res.status(200).json(rows);
  } catch (err) { return next(err); }
};

exports.get = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });
    const row = await itemMasterModel.findById(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json(row);
  } catch (err) { return next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const body = req.body || {};
    const err = validateBody(body);
    if (err) return res.status(400).json({ error: err });

    const existing = await itemMasterModel.findByName(String(body.name).trim());
    if (existing) return res.status(409).json({ error: 'name_taken', message: 'An item with that name already exists.' });

    const userId = req.user ? req.user.id : null;
    const { id } = await itemMasterModel.create({ ...body, userId });
    return res.status(201).json({ id });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'name_taken', message: 'An item with that name already exists.' });
    return next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });
    const existing = await itemMasterModel.findById(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });

    const body = req.body || {};
    const err = validateBody(body);
    if (err) return res.status(400).json({ error: err });

    await itemMasterModel.update(id, body);
    return res.status(200).json({ ok: true });
  } catch (err) { return next(err); }
};
