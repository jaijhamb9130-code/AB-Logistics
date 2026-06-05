'use strict';

const vehicleMasterModel = require('../models/vehicleMasterModel');
const {
  isNonEmptyString,
  validatePAN,
  validateMobile,
  parseId,
} = require('../utils/validators');

// Accept either `name` or `vehicle_no` for the registration number.
function vehicleNoOf(body) {
  return body.vehicle_no ?? body.name;
}

function validateBody(body) {
  if (!isNonEmptyString(vehicleNoOf(body))) return 'invalid_name';
  // Owner contact fields are optional; validate format only when present.
  const checks = [
    body.mobile ? validateMobile(body.mobile) : null,
    body.pan_no ? validatePAN(body.pan_no) : null,
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

    // Uniqueness check on registration number
    const existing = await vehicleMasterModel.findByName(String(vehicleNoOf(body)).trim().toUpperCase());
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

    // mode: 'maintain' edits the current version in place; 'create' adds a new
    // owner-version against the same vehicle number (history preserved).
    const mode = body.mode === 'create' ? 'create' : 'maintain';

    // If renamed (maintain only), ensure no other vehicle owns the new number.
    const newName = String(vehicleNoOf(body)).trim().toUpperCase();
    if (mode === 'maintain' && newName !== existing.name) {
      const dup = await vehicleMasterModel.findByName(newName);
      if (dup && dup.id !== id) return res.status(409).json({ error: 'name_taken' });
    }

    const userId = req.user ? req.user.id : null;
    await vehicleMasterModel.update(id, { ...body, userId }, mode);
    return res.status(200).json({ ok: true });
  } catch (err) { return next(err); }
};

// DELETE /api/vehicle-master/:id
exports.remove = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });
    const existing = await vehicleMasterModel.findById(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    const result = await vehicleMasterModel.deleteById(id);
    if (result && result.in_use) {
      return res.status(409).json({
        error: 'in_use',
        message: 'Vehicle is referenced by existing records.',
      });
    }
    if (!result || !result.affected) return res.status(404).json({ error: 'not_found' });
    return res.status(204).end();
  } catch (err) {
    if (err && err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({
        error: 'in_use',
        message: 'Vehicle is referenced by existing records.',
      });
    }
    return next(err);
  }
};
