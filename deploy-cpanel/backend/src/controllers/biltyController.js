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

// GET /api/bilty/next-no?branch=Mumbai
// Returns the next numeric bilty no for the given branch (or globally when
// branch is omitted). Caller is the form's auto-suggest on Branch pick.
exports.nextNo = async (req, res, next) => {
  try {
    const branch = req.query.branch ? String(req.query.branch).trim() : null;
    const next = await biltyModel.nextBiltyNo(branch);
    return res.status(200).json({ next });
  } catch (err) {
    return next(err);
  }
};

// GET /api/bilty/by-no/:no  — resolves bilty_no → { id }. Used by the
// frontend when the URL carries a bilty_no (e.g. /edit/bilty/18520) and
// the form needs the primary key to load the record.
exports.idByNo = async (req, res, next) => {
  try {
    const no = String(req.params.no || '').trim();
    if (!no) {
      return res.status(400).json({ success: false, error: { type: 'VALIDATION_ERROR', message: 'bilty_no required' } });
    }
    const id = await biltyModel.findIdByBiltyNo(no);
    if (id === null) {
      return res.status(404).json({ success: false, error: { type: 'NOT_FOUND', message: 'Bilty not found' } });
    }
    return res.status(200).json({ id });
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
    const { header, items } = req.body;
    const userId = req.user ? req.user.id : null;
    const ip = req.ip;
    const { id, bilty_no } = await createBilty({ header, items, userId, ip });
    return res.status(201).json({ id, bilty_no });
  } catch (err) {
    return next(err);
  }
};

// DELETE /api/bilty/:id — hard delete. Returns 204 on success, 409 in_use
// when a freight memo (or other downstream voucher row) still references
// this bilty.
exports.remove = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) {
      return res.status(400).json({ success: false, error: { type: 'VALIDATION_ERROR', message: 'Invalid id' } });
    }
    const existing = await biltyModel.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: { type: 'NOT_FOUND', message: 'Bilty not found' } });
    }
    const result = await biltyModel.deleteById(id);
    if (result && result.in_use) {
      return res.status(409).json({
        error: 'in_use',
        message: 'Bilty is referenced by an existing freight memo or voucher.',
      });
    }
    if (!result || !result.affected) {
      return res.status(404).json({ success: false, error: { type: 'NOT_FOUND', message: 'Bilty not found' } });
    }
    return res.status(204).end();
  } catch (err) {
    if (err && err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({
        error: 'in_use',
        message: 'Bilty is referenced by an existing freight memo or voucher.',
      });
    }
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
    const { header, items } = req.body;
    const userId = req.user ? req.user.id : null;
    const ok = await biltyModel.updateWithChildren(id, { header, items, userId });
    if (!ok) {
      return res.status(404).json({ success: false, error: { type: 'NOT_FOUND', message: 'Bilty not found' } });
    }
    const row = await biltyModel.findById(id);
    return res.status(200).json(row);
  } catch (err) {
    return next(err);
  }
};
