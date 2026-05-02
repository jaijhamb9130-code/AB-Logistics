'use strict';

const vehicleMasterModel = require('../models/vehicleMasterModel');
const {
  isNonEmptyString,
  validatePAN,
  validateMobile,
  validateDate,
  parseId,
} = require('../utils/validators');

function validateBody(body) {
  if (!isNonEmptyString(body.name)) return 'invalid_name';
  const checks = [
    validateMobile(body.owner_mobile),
    validatePAN(body.owner_pan),
    validateMobile(body.driver_mobile),
    validateDate(body.validity_date),
  ];
  return checks.find(Boolean) || null;
}

exports.list = async (_req, res, next) => {
  try {
    const rows = await vehicleMasterModel.findAll();
    return res.status(200).json(rows);
  } catch (err) { return next(err); }
};

exports.search = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length === 0) return res.status(200).json([]);
    const rows = await vehicleMasterModel.search(q);
    return res.status(200).json(rows);
  } catch (err) { return next(err); }
};

exports.get = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });
    const row = await vehicleMasterModel.findById(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json(row);
  } catch (err) { return next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const body = req.body || {};
    const err = validateBody(body);
    if (err) return res.status(400).json({ error: err });

    // Uniqueness check on registration number (name)
    const existing = await vehicleMasterModel.findByName(String(body.name).trim().toUpperCase());
    if (existing) return res.status(409).json({ error: 'name_taken', message: 'A vehicle with that registration number already exists.' });

    const userId = req.user ? req.user.id : null;
    const { id } = await vehicleMasterModel.create({ ...body, userId });
    return res.status(201).json({ id });
  } catch (err) { return next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });
    const existing = await vehicleMasterModel.findById(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });

    const body = req.body || {};
    const err = validateBody(body);
    if (err) return res.status(400).json({ error: err });

    // If renamed, ensure no other vehicle owns the new name.
    const newName = String(body.name).trim().toUpperCase();
    if (newName !== existing.name) {
      const dup = await vehicleMasterModel.findByName(newName);
      if (dup && dup.id !== id) return res.status(409).json({ error: 'name_taken' });
    }

    await vehicleMasterModel.update(id, body);
    return res.status(200).json({ ok: true });
  } catch (err) { return next(err); }
};

exports.sync = async (_req, res) => {
  return res.status(501).json({
    error: 'tally_sync_pending',
    message: 'Tally sync will be enabled once the integration endpoint is configured.',
  });
};
