'use strict';

const destinationModel = require('../models/destinationModel');
const { isNonEmptyString, validatePincode, parseId } = require('../utils/validators');

function validateBody(body) {
  if (!isNonEmptyString(body.name)) return 'invalid_name';
  return validatePincode(body.pincode);
}

// GET /api/destinations?branch=Mumbai      (omit branch to list all)
exports.list = async (req, res, next) => {
  try {
    const branch = req.query.branch ? String(req.query.branch).trim() : null;
    const rows = await destinationModel.findAll(branch);
    return res.status(200).json(rows);
  } catch (err) { return next(err); }
};

// GET /api/destinations/:id
exports.get = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });
    const row = await destinationModel.findById(id);
    if (!row) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json(row);
  } catch (err) { return next(err); }
};

// POST /api/destinations  body: { branch, name, city, state, pincode }
exports.create = async (req, res, next) => {
  try {
    const body = req.body || {};
    const err = validateBody(body);
    if (err) return res.status(400).json({ error: err });

    const userId = req.user ? req.user.id : null;
    const { id } = await destinationModel.create({ ...body, userId });
    return res.status(201).json({ id });
  } catch (err) { return next(err); }
};

// PUT /api/destinations/:id
exports.update = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });
    const existing = await destinationModel.findById(id);
    if (!existing) return res.status(404).json({ error: 'not_found' });

    const body = req.body || {};
    const err = validateBody(body);
    if (err) return res.status(400).json({ error: err });

    await destinationModel.update(id, body);
    return res.status(200).json({ ok: true });
  } catch (err) { return next(err); }
};

// GET /api/destinations/branches               — distinct branch names (for Bilty Branch dropdown)
exports.listBranches = async (_req, res, next) => {
  try {
    const branches = await destinationModel.listBranches();
    return res.status(200).json(branches);
  } catch (err) { return next(err); }
};

// GET /api/destinations/branches/search?q=foo  — autocomplete on branch names
exports.searchBranches = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length === 0) return res.status(200).json([]);
    const branches = await destinationModel.searchBranches(q);
    return res.status(200).json(branches);
  } catch (err) { return next(err); }
};

// GET /api/destinations/search?q=foo&branch=Mumbai — From/To autocomplete
exports.searchLocations = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const branch = req.query.branch ? String(req.query.branch).trim() : null;
    if (q.length === 0) return res.status(200).json([]);
    const rows = await destinationModel.searchLocations(q, branch);
    return res.status(200).json(rows);
  } catch (err) { return next(err); }
};

// POST /api/destinations/sync — Tally sync stub
exports.sync = async (_req, res) => {
  return res.status(501).json({
    error: 'tally_sync_pending',
    message: 'Tally sync will be enabled once the integration endpoint is configured.',
  });
};
