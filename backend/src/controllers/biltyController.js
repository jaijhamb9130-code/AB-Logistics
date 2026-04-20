'use strict';

/**
 * Phase 3 — Bilty controller.
 *
 * Permission gates (set in routes/bilty.js):
 *   GET  /api/bilty      → bilty.read
 *   GET  /api/bilty/:id  → bilty.read
 *   POST /api/bilty      → bilty.edit
 *   PATCH /api/bilty/:id → bilty.edit
 *
 * Required fields on create: consignor, truck_no, ≥1 items (qty>0 && rate>0).
 * Returns { id, bilty_no } on 201 create (server-generated bilty_no).
 * Update is a full replace of header + children (bilty_no preserved).
 */

const biltyModel = require('../models/biltyModel');
const { createBilty } = require('../services/BiltyService');

function parseId(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// GET /api/bilty
exports.list = async (_req, res, next) => {
  try {
    const rows = await biltyModel.findAll();
    return res.status(200).json(rows);
  } catch (err) {
    return next(err);
  }
};

// GET /api/bilty/:id
exports.get = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ success: false, error: { type: 'VALIDATION_ERROR', message: 'Invalid id' } });
    }
    const row = await biltyModel.findById(id);
    if (!row) return res.status(404).json({ success: false, error: { type: 'NOT_FOUND', message: 'Bilty not found' } });
    return res.status(200).json(row);
  } catch (err) {
    return next(err);
  }
};

// POST /api/bilty  — body already validated by validate(CreateBiltySchema) middleware
exports.create = async (req, res, next) => {
  try {
    const { header, items, advances, fuels } = req.body;
    const userId = req.user ? req.user.id : null;
    const ip = req.ip;
    const { id, bilty_no } = await createBilty({ header, items, advances, fuels, userId, ip });
    return res.status(201).json({ id, bilty_no });
  } catch (err) {
    return next(err);
  }
};

// PATCH /api/bilty/:id — body validated by validate(CreateBiltySchema) middleware
exports.update = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ success: false, error: { type: 'VALIDATION_ERROR', message: 'Invalid id' } });
    }
    const { header, items, advances, fuels } = req.body;
    const ok = await biltyModel.updateWithChildren(id, { header, items, advances, fuels });
    if (!ok) {
      return res.status(404).json({ success: false, error: { type: 'NOT_FOUND', message: 'Bilty not found' } });
    }
    const row = await biltyModel.findById(id);
    return res.status(200).json(row);
  } catch (err) {
    return next(err);
  }
};
