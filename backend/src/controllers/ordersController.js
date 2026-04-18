'use strict';

/**
 * Phase 5 — Orders controller.
 *
 * Permission gates (set in routes/orders.js):
 *   GET   /api/orders               → order.read
 *   GET   /api/orders/:id           → order.read
 *   POST  /api/orders               → order.edit
 *   PATCH /api/orders/:id/status    → order.edit
 *   PATCH /api/orders/:id/vehicle   → order.edit
 *
 * Status transitions are enforced by orderModel.updateStatus — illegal
 * transitions throw invalid_status_transition → HTTP 400 here.
 */

const orderModel = require('../models/orderModel');

function parseId(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

// GET /api/orders
exports.list = async (_req, res, next) => {
  try {
    const rows = await orderModel.findAll();
    return res.status(200).json(rows);
  } catch (err) {
    return next(err);
  }
};

// GET /api/orders/:id
exports.get = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });

    const row = await orderModel.findById(id);
    if (!row) return res.status(404).json({ error: 'order_not_found' });
    return res.status(200).json(row);
  } catch (err) {
    return next(err);
  }
};

// POST /api/orders
exports.create = async (req, res, next) => {
  try {
    const body = req.body || {};
    const { order_date, customer_name, from_loc, to_loc, goods_desc, vehicle_id } = body;

    if (!isNonEmptyString(customer_name)) {
      return res.status(400).json({ error: 'invalid_customer_name' });
    }

    // vehicle_id is optional; if supplied must be a positive integer.
    let vid = null;
    if (vehicle_id !== undefined && vehicle_id !== null && vehicle_id !== '') {
      vid = parseId(vehicle_id);
      if (vid === null) return res.status(400).json({ error: 'invalid_vehicle_id' });
    }

    const userId = req.user ? req.user.id : null;
    const { id, order_no } = await orderModel.create({
      order_date,
      customer_name: customer_name.trim(),
      from_loc,
      to_loc,
      goods_desc,
      vehicle_id: vid,
      userId,
    });

    return res.status(201).json({ id, order_no });
  } catch (err) {
    return next(err);
  }
};

// PATCH /api/orders/:id/status   body: { status }
exports.updateStatus = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });

    const status = (req.body || {}).status;
    if (!isNonEmptyString(status)) {
      return res.status(400).json({ error: 'invalid_status' });
    }

    await orderModel.updateStatus(id, status);
    const row = await orderModel.findById(id);
    return res.status(200).json(row);
  } catch (err) {
    if (err && err.code === 'order_not_found') {
      return res.status(404).json({ error: 'order_not_found' });
    }
    if (err && err.code === 'invalid_status_transition') {
      return res.status(400).json({ error: 'invalid_status_transition' });
    }
    return next(err);
  }
};

// PATCH /api/orders/:id/vehicle   body: { vehicle_id }
exports.assignVehicle = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });

    const vehicleId = parseId((req.body || {}).vehicle_id);
    if (vehicleId === null) return res.status(400).json({ error: 'invalid_vehicle_id' });

    await orderModel.assignVehicle(id, vehicleId);
    const row = await orderModel.findById(id);
    return res.status(200).json(row);
  } catch (err) {
    if (err && err.code === 'order_not_found') {
      return res.status(404).json({ error: 'order_not_found' });
    }
    if (err && err.code === 'vehicle_not_found') {
      return res.status(404).json({ error: 'vehicle_not_found' });
    }
    return next(err);
  }
};
