'use strict';

/**
 * Phase 5 — Vehicles controller.
 *
 * Permission gates (set in routes/vehicles.js):
 *   GET  /api/vehicles            → vehicle.read
 *   GET  /api/vehicles/:id        → vehicle.read
 *   POST /api/vehicles            → vehicle.edit
 *   PATCH /api/vehicles/:id       → vehicle.edit
 *   POST /api/vehicles/:id/deactivate → vehicle.edit
 *   POST /api/vehicles/:id/activate   → vehicle.edit
 */

const vehicleModel = require('../models/vehicleModel');

const VEHICLE_NO_RE = /^[a-zA-Z0-9\-\s.]{2,64}$/;

function parseId(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function sanitize(row) {
  if (!row) return null;
  return {
    id: row.id,
    vehicle_no: row.vehicle_no,
    vehicle_type: row.vehicle_type,
    owner_name: row.owner_name,
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// GET /api/vehicles
exports.list = async (_req, res, next) => {
  try {
    const rows = await vehicleModel.findAll();
    return res.status(200).json(rows.map(sanitize));
  } catch (err) {
    return next(err);
  }
};

// GET /api/vehicles/:id
exports.get = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });

    const row = await vehicleModel.findById(id);
    if (!row) return res.status(404).json({ error: 'vehicle_not_found' });
    return res.status(200).json(sanitize(row));
  } catch (err) {
    return next(err);
  }
};

// POST /api/vehicles
exports.create = async (req, res, next) => {
  try {
    const body = req.body || {};
    const { vehicle_no, vehicle_type, owner_name } = body;

    if (!isNonEmptyString(vehicle_no) || !VEHICLE_NO_RE.test(vehicle_no.trim())) {
      return res.status(400).json({ error: 'invalid_vehicle_no' });
    }

    const trimmed = vehicle_no.trim();
    const existing = await vehicleModel.findByVehicleNo(trimmed);
    if (existing) return res.status(409).json({ error: 'vehicle_no_taken' });

    const insertId = await vehicleModel.create({
      vehicle_no: trimmed,
      vehicle_type: vehicle_type ?? null,
      owner_name: owner_name ?? null,
    });

    const row = await vehicleModel.findById(insertId);
    return res.status(201).json(sanitize(row));
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'vehicle_no_taken' });
    }
    return next(err);
  }
};

// PATCH /api/vehicles/:id
exports.update = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });

    const body = req.body || {};
    const { vehicle_no, vehicle_type, owner_name } = body;

    if (
      vehicle_no === undefined &&
      vehicle_type === undefined &&
      owner_name === undefined
    ) {
      return res.status(400).json({ error: 'invalid_body' });
    }

    if (vehicle_no !== undefined) {
      if (!isNonEmptyString(vehicle_no) || !VEHICLE_NO_RE.test(vehicle_no.trim())) {
        return res.status(400).json({ error: 'invalid_vehicle_no' });
      }
    }

    const patch = {};
    if (vehicle_no !== undefined) patch.vehicle_no = vehicle_no.trim();
    if (vehicle_type !== undefined) patch.vehicle_type = vehicle_type;
    if (owner_name !== undefined) patch.owner_name = owner_name;

    const ok = await vehicleModel.update(id, patch);
    if (!ok) return res.status(404).json({ error: 'vehicle_not_found' });

    const row = await vehicleModel.findById(id);
    return res.status(200).json(sanitize(row));
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'vehicle_no_taken' });
    }
    return next(err);
  }
};

// POST /api/vehicles/:id/deactivate
exports.deactivate = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });

    const ok = await vehicleModel.setActive(id, 0);
    if (!ok) return res.status(404).json({ error: 'vehicle_not_found' });

    const row = await vehicleModel.findById(id);
    return res.status(200).json(sanitize(row));
  } catch (err) {
    return next(err);
  }
};

// POST /api/vehicles/:id/activate
exports.activate = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });

    const ok = await vehicleModel.setActive(id, 1);
    if (!ok) return res.status(404).json({ error: 'vehicle_not_found' });

    const row = await vehicleModel.findById(id);
    return res.status(200).json(sanitize(row));
  } catch (err) {
    return next(err);
  }
};
