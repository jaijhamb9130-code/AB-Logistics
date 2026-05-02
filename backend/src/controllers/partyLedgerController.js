'use strict';

const partyLedgerModel = require('../models/partyLedgerModel');
const {
  isNonEmptyString,
  validateGST,
  validatePAN,
  validatePincode,
  parseId,
} = require('../utils/validators');

// Backward-compat: callers can still pass legacy slugs ("party"/"owner"/"agent").
// All real validation now happens at the DB layer via the FK from
// party_ledger.ledger_group_id → ledger_groups.id. New ledger groups added
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

// GET /api/party-ledger?type=1|2|3
exports.list = async (req, res, next) => {
  try {
    const groupId = parseGroupId(req.query.type);
    if (!groupId) return res.status(400).json({ error: 'invalid_type' });
    const rows = await partyLedgerModel.findAll(groupId);
    return res.status(200).json(rows);
  } catch (err) { return next(err); }
};

// GET /api/party-ledger/search?type=1&q=foo
exports.search = async (req, res, next) => {
  try {
    const groupId = parseGroupId(req.query.type);
    if (!groupId) return res.status(400).json({ error: 'invalid_type' });
    const q = String(req.query.q || '').trim();
    if (q.length === 0) return res.status(200).json([]);
    const rows = await partyLedgerModel.search(groupId, q);
    return res.status(200).json(rows);
  } catch (err) { return next(err); }
};

// GET /api/party-ledger/:id
exports.get = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });
    const row = await partyLedgerModel.findById(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json(row);
  } catch (err) { return next(err); }
};

// POST /api/party-ledger  body: { ledger_group_id, name, gst_no, pan_no, address, city, state, country, pincode }
exports.create = async (req, res, next) => {
  try {
    const body = req.body || {};
    // Check both legacy 'type' and new 'ledger_group_id'
    const groupId = parseGroupId(body.ledger_group_id || body.type);
    if (!groupId) return res.status(400).json({ error: 'invalid_type' });
    const err = validateBody(body);
    if (err) return res.status(400).json({ error: err });

    const userId = req.user ? req.user.id : null;
    const { id } = await partyLedgerModel.create({ ...body, ledger_group_id: groupId, userId });
    return res.status(201).json({ id });
  } catch (err) { return next(err); }
};


// PUT /api/party-ledger/:id
exports.update = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });
    const existing = await partyLedgerModel.findById(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });

    const body = req.body || {};
    const err = validateBody(body);
    if (err) return res.status(400).json({ error: err });

    await partyLedgerModel.update(id, body);
    return res.status(200).json({ ok: true });
  } catch (err) { return next(err); }
};

// POST /api/party-ledger/sync — Tally sync stub. Returns 501 until endpoint configured.
exports.sync = async (_req, res) => {
  return res.status(501).json({
    error: 'tally_sync_pending',
    message: 'Tally sync will be enabled once the integration endpoint is configured.',
  });
};
