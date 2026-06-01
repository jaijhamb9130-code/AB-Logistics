'use strict';

const ledgerMasterModel = require('../models/ledgerMasterModel');
const {
  isNonEmptyString,
  validateGST,
  validatePAN,
  validatePincode,
  parseId,
} = require('../utils/validators');

// Backward-compat: callers can still pass legacy slugs ("party"/"owner"/"agent").
// All real validation now happens at the DB layer via the FK from
// ledger_master.ledger_group_id → ledger_groups.id. New ledger groups added
// to the ledger_groups table (manually or via Tally sync) will work
// automatically — no code changes needed here.
const LEGACY_SLUG_MAP = { party: 1, owner: 2, agent: 3 };

function parseGroupId(raw) {
  if (raw == null || raw === '') return null;
  // Legacy slug → map to its seeded numeric id.
  if (typeof raw === 'string' && LEGACY_SLUG_MAP[raw.toLowerCase()]) {
    return LEGACY_SLUG_MAP[raw.toLowerCase()];
  }
  // Otherwise, accept any positive integer. The DB FK rejects invalid ids.
  const id = parseInt(raw, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validateBody(body) {
  if (!isNonEmptyString(body.name)) return 'invalid_name';
  const checks = [
    validateGST(body.gst_no),
    validatePAN(body.pan_no),
    validatePincode(body.pincode),
  ];
  return checks.find(Boolean) || null;
}

// GET /api/ledger-master?type=1|2|3&exclude=2,3
// `type` is optional — when omitted, returns ledgers across ALL groups
// (used by the Ledger Master "all" view).
// `exclude` is optional comma-separated group ids to omit when `type` is
// not set (Ledger Master view excludes Owner=2 / Agent=3 rows).
exports.list = async (req, res, next) => {
  try {
    if (req.query.type === undefined || req.query.type === '') {
      const excludeIds = String(req.query.exclude || '')
        .split(',')
        .map((s) => parseGroupId(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
      const rows = await ledgerMasterModel.findAll(null, { excludeIds });
      return res.status(200).json(rows);
    }
    const groupId = parseGroupId(req.query.type);
    if (!groupId) return res.status(400).json({ error: 'invalid_type' });
    const rows = await ledgerMasterModel.findAll(groupId);
    return res.status(200).json(rows);
  } catch (err) { return next(err); }
};

// GET /api/ledger-master/search?q=foo&type=1
// `type` is optional — when omitted, search runs across ALL ledger groups
// (used by the Voucher form's Ledger Name autocomplete).
exports.search = async (req, res, next) => {
  try {
    const rawType = req.query.type;
    const hasType = rawType != null && rawType !== '';
    let groupId = null;
    if (hasType) {
      groupId = parseGroupId(rawType);
      if (!groupId) return res.status(400).json({ error: 'invalid_type' });
    }
    const q = String(req.query.q || '').trim();
    if (q.length === 0) return res.status(200).json([]);
    const rows = await ledgerMasterModel.search(groupId, q);
    return res.status(200).json(rows);
  } catch (err) { return next(err); }
};

// GET /api/ledger-master/:id
exports.get = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });
    const row = await ledgerMasterModel.findById(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json(row);
  } catch (err) { return next(err); }
};

// POST /api/ledger-master  body: { ledger_group_id, name, gst_no, pan_no, address, city, state, country, pincode }
exports.create = async (req, res, next) => {
  try {
    const body = req.body || {};
    // Check both legacy 'type' and new 'ledger_group_id'
    const groupId = parseGroupId(body.ledger_group_id || body.type);
    if (!groupId) return res.status(400).json({ error: 'invalid_type' });
    const err = validateBody(body);
    if (err) return res.status(400).json({ error: err });

    const userId = req.user ? req.user.id : null;
    const { id } = await ledgerMasterModel.create({ ...body, ledger_group_id: groupId, userId });
    return res.status(201).json({ id });
  } catch (err) { return next(err); }
};


// PUT /api/ledger-master/:id
exports.update = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });
    const existing = await ledgerMasterModel.findById(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });

    const body = req.body || {};
    const err = validateBody(body);
    if (err) return res.status(400).json({ error: err });

    await ledgerMasterModel.update(id, body);
    return res.status(200).json({ ok: true });
  } catch (err) { return next(err); }
};

// DELETE /api/ledger-master/:id — admin-only (route gating). Hard delete;
// the DB FK to vouchers / bilty headers will block delete if rows reference
// the ledger, surfaced as a 409 to the client.
exports.delete = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });
    const existing = await ledgerMasterModel.findById(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });
    await ledgerMasterModel.deleteById(id);
    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err && err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(409).json({
        error: 'in_use',
        message: 'Ledger is referenced by existing vouchers / bilty rows.',
      });
    }
    return next(err);
  }
};

// POST /api/ledger-master/sync — Tally sync stub. Returns 501 until endpoint configured.
exports.sync = async (_req, res) => {
  return res.status(501).json({
    error: 'tally_sync_pending',
    message: 'Tally sync will be enabled once the integration endpoint is configured.',
  });
};
