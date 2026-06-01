'use strict';

const voucherModel = require('../models/voucherModel');
const { parseId } = require('../utils/validators');

function validateCreateBody(body) {
  if (!body || typeof body !== 'object') return 'invalid_body';
  const partyId = parseInt(body.ledger_master_id, 10);
  if (!partyId || Number.isNaN(partyId)) return 'invalid_ledger_master_id';
  if (body.items && !Array.isArray(body.items)) return 'invalid_items';
  if (body.ledgers && !Array.isArray(body.ledgers)) return 'invalid_ledgers';
  if (body.bill_allocation && !Array.isArray(body.bill_allocation)) return 'invalid_bill_allocation';
  return null;
}

// POST /api/vouchers
exports.create = async (req, res, next) => {
  try {
    const err = validateCreateBody(req.body);
    if (err) return res.status(400).json({ error: err });
    const userId = req.user ? req.user.id : null;
    const { id } = await voucherModel.create(req.body, userId);
    return res.status(201).json({ id });
  } catch (err) {
    if (err && err.code === 'duplicate_vch_no') {
      return res.status(409).json({ error: 'duplicate_vch_no', message: err.message });
    }
    return next(err);
  }
};

// GET /api/vouchers?page=&limit=&vch_type=&search=&date_from=&date_to=
exports.list = async (req, res, next) => {
  try {
    const result = await voucherModel.findAll({
      page: req.query.page,
      limit: req.query.limit,
      vchType: req.query.vch_type,
      search: req.query.search,
      dateFrom: req.query.date_from,
      dateTo: req.query.date_to,
    });
    return res.status(200).json(result);
  } catch (err) { return next(err); }
};

// GET /api/vouchers/next-no?vch_type_id=
exports.nextNo = async (req, res, next) => {
  try {
    const id = parseId(req.query.vch_type_id);
    if (id === null) return res.status(400).json({ error: 'invalid_vch_type_id' });
    const vchNo = await voucherModel.getNextVoucherNo(id);
    return res.status(200).json({ vch_no: vchNo });
  } catch (err) { return next(err); }
};

// GET /api/vouchers/pending-refs?customer_id=
exports.pendingRefs = async (req, res, next) => {
  try {
    const cId = parseId(req.query.customer_id);
    if (cId === null) return res.status(400).json({ error: 'invalid_customer_id' });
    const rows = await voucherModel.getPendingRefs(cId);
    return res.status(200).json(rows);
  } catch (err) { return next(err); }
};

// GET /api/vouchers/daybook?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
exports.daybook = async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const fromDate = String(req.query.date_from || today);
    const toDate = String(req.query.date_to || today);
    const rows = await voucherModel.getDaybook(fromDate, toDate);
    return res.status(200).json(rows);
  } catch (err) { return next(err); }
};

// GET /api/vouchers/other-ledgers
exports.otherLedgers = async (_req, res, next) => {
  try {
    const rows = await voucherModel.findOtherLedgers();
    return res.status(200).json(rows);
  } catch (err) { return next(err); }
};

// GET /api/vouchers/ledger-search?q=
exports.ledgerSearch = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.status(200).json([]);
    const rows = await voucherModel.searchAllLedgers(q);
    return res.status(200).json(rows);
  } catch (err) { return next(err); }
};

// GET /api/vouchers/:id
exports.get = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });
    const row = await voucherModel.findById(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json(row);
  } catch (err) { return next(err); }
};

// PUT /api/vouchers/:id
exports.update = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });
    const err = validateCreateBody(req.body);
    if (err) return res.status(400).json({ error: err });
    const existing = await voucherModel.findById(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    await voucherModel.update(id, req.body);
    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err && err.code === 'duplicate_vch_no') {
      return res.status(409).json({ error: 'duplicate_vch_no', message: err.message });
    }
    return next(err);
  }
};

// DELETE /api/vouchers/:id
exports.remove = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });
    const existing = await voucherModel.findById(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    await voucherModel.remove(id);
    return res.status(204).end();
  } catch (err) { return next(err); }
};
