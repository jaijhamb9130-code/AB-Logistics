'use strict';

/**
 * Phase 4 — Freight Memo controller.
 *
 * Permission gates (set in routes/freight.js):
 *   POST /api/freight/generate          → bilty.edit  (side-effect: write)
 *   GET  /api/freight                   → freight.read
 *   GET  /api/freight/:id               → freight.read
 *   GET  /api/freight/by-bilty/:biltyId → freight.read
 *
 * Errors:
 *   400 invalid_bilty_id | invalid_id
 *   404 bilty_not_found | memo_not_found
 *   409 memo_exists      (one-memo-per-bilty constraint)
 */

const freightModel = require('../models/freightModel');
const { generateMemo } = require('../services/FreightService');

function parseId(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// POST /api/freight/generate   body: { bilty_id } — validated by validate(GenerateFreightSchema)
exports.generate = async (req, res, next) => {
  try {
    const { bilty_id } = req.body;
    const userId = req.user ? req.user.id : null;
    const memo = await generateMemo({ biltyId: bilty_id, userId, ip: req.ip });
    return res.status(201).json(memo);
  } catch (err) {
    if (err && err.code === 'bilty_not_found') {
      return res.status(404).json({ success: false, error: { type: 'NOT_FOUND', message: 'Bilty not found' } });
    }
    if (err && (err.code === 'memo_exists' || err.code === 'ER_DUP_ENTRY')) {
      return res.status(409).json({ success: false, error: { type: 'CONFLICT', message: 'Freight memo already exists for this bilty' } });
    }
    return next(err);
  }
};

// GET /api/freight
exports.list = async (_req, res, next) => {
  try {
    const rows = await freightModel.findAll();
    return res.status(200).json(rows);
  } catch (err) {
    return next(err);
  }
};

// GET /api/freight/:id
exports.get = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });

    const row = await freightModel.findById(id);
    if (!row) return res.status(404).json({ error: 'memo_not_found' });
    return res.status(200).json(row);
  } catch (err) {
    return next(err);
  }
};

// GET /api/freight/by-bilty/:biltyId
exports.getByBiltyId = async (req, res, next) => {
  try {
    const biltyId = parseId(req.params.biltyId);
    if (biltyId === null) return res.status(400).json({ error: 'invalid_bilty_id' });

    const row = await freightModel.findByBiltyId(biltyId);
    if (!row) return res.status(404).json({ error: 'memo_not_found' });
    return res.status(200).json(row);
  } catch (err) {
    return next(err);
  }
};
