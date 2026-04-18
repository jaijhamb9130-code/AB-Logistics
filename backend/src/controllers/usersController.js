'use strict';

/**
 * Phase 02-01 — admin-only user CRUD controller.
 *
 * NOTE: sanitizeUser + parsePerms are replicated locally (copied from
 * authController) to keep this plan's scope tight. A future plan MAY
 * extract them into src/utils/sanitize.js — not done now to avoid a
 * cross-plan refactor.
 *
 * All handlers assume authMiddleware + requireRole('admin') has already
 * run (enforced at router level — see routes/users.js).
 */

const userModel = require('../models/userModel');
const { hashPassword } = require('../utils/password');
const {
  isValidPermissionArray,
} = require('../constants/permissions');

const USERNAME_RE = /^[a-zA-Z0-9_.\-]{3,64}$/;
const MIN_PASSWORD = 8;
const VALID_ROLES = ['admin', 'staff'];

// -- helpers ----------------------------------------------------------------

function parsePerms(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.length > 0) {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

// T-02-02 mitigation: every user response body goes through this.
function sanitizeUser(row) {
  if (!row) return null;
  const { password_hash: _p, ...rest } = row;
  return {
    id: rest.id,
    username: rest.username,
    role: rest.role,
    permissions: parsePerms(rest.permissions),
    is_active: Boolean(rest.is_active),
    created_at: rest.created_at,
    updated_at: rest.updated_at,
  };
}

function parseId(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Individual field validators — return an error code string, or null if ok.
function validateUsername(u) {
  if (typeof u !== 'string' || !USERNAME_RE.test(u)) return 'invalid_username';
  return null;
}
function validatePassword(p) {
  if (typeof p !== 'string' || p.length < MIN_PASSWORD) return 'invalid_password';
  return null;
}
function validateRole(r) {
  if (!VALID_ROLES.includes(r)) return 'invalid_role';
  return null;
}
function validatePermissions(perms) {
  if (!isValidPermissionArray(perms)) return 'invalid_permissions';
  return null;
}

// -- handlers ---------------------------------------------------------------

// GET /api/users
exports.list = async (req, res, next) => {
  try {
    const rows = await userModel.findAll();
    return res.status(200).json(rows.map(sanitizeUser));
  } catch (err) {
    return next(err);
  }
};

// GET /api/users/:id
exports.get = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });

    const row = await userModel.findById(id);
    if (!row) return res.status(404).json({ error: 'user_not_found' });
    return res.status(200).json(sanitizeUser(row));
  } catch (err) {
    return next(err);
  }
};

// POST /api/users
exports.create = async (req, res, next) => {
  try {
    const body = req.body || {};
    const { username, password, role, permissions } = body;

    // Required-field presence check first — 400 invalid_body covers missing.
    if (
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      typeof role !== 'string' ||
      !Array.isArray(permissions)
    ) {
      return res.status(400).json({ error: 'invalid_body' });
    }

    // Per-field validation — ordered so the most specific error wins.
    const userErr = validateUsername(username);
    if (userErr) return res.status(400).json({ error: userErr });

    const passErr = validatePassword(password);
    if (passErr) return res.status(400).json({ error: passErr });

    const roleErr = validateRole(role);
    if (roleErr) return res.status(400).json({ error: roleErr });

    const permErr = validatePermissions(permissions);
    if (permErr) return res.status(400).json({ error: permErr });

    // Uniqueness (T-02-06 accepted: admin enumeration is fine here).
    const existing = await userModel.findByUsername(username);
    if (existing) return res.status(409).json({ error: 'username_taken' });

    // Single bcrypt callsite (T-01-06 / T-02-03).
    const password_hash = await hashPassword(password);

    const insertId = await userModel.create({
      username,
      password_hash,
      role,
      permissions,
    });

    const row = await userModel.findById(insertId);
    return res.status(201).json(sanitizeUser(row));
  } catch (err) {
    return next(err);
  }
};

// PATCH /api/users/:id
exports.update = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });

    const body = req.body || {};
    const { username, password, role, permissions } = body;

    // Must supply at least one updatable field.
    if (
      username === undefined &&
      password === undefined &&
      role === undefined &&
      permissions === undefined
    ) {
      return res.status(400).json({ error: 'invalid_body' });
    }

    if (username !== undefined) {
      const e = validateUsername(username);
      if (e) return res.status(400).json({ error: e });
    }
    if (password !== undefined) {
      const e = validatePassword(password);
      if (e) return res.status(400).json({ error: e });
    }
    if (role !== undefined) {
      const e = validateRole(role);
      if (e) return res.status(400).json({ error: e });
    }
    if (permissions !== undefined) {
      const e = validatePermissions(permissions);
      if (e) return res.status(400).json({ error: e });
    }

    // Uniqueness pre-check — avoid a race and surface 409 early.
    if (username !== undefined) {
      const clash = await userModel.findByUsernameExcludingId(username, id);
      if (clash) return res.status(409).json({ error: 'username_taken' });
    }

    // Build the patch — hash the password here, never pass plain through.
    const patch = {};
    if (username !== undefined) patch.username = username;
    if (role !== undefined) patch.role = role;
    if (permissions !== undefined) patch.permissions = permissions;
    if (password !== undefined) {
      patch.password_hash = await hashPassword(password);
    }

    const ok = await userModel.update(id, patch);
    if (!ok) return res.status(404).json({ error: 'user_not_found' });

    const row = await userModel.findById(id);
    return res.status(200).json(sanitizeUser(row));
  } catch (err) {
    return next(err);
  }
};

// POST /api/users/:id/deactivate
exports.deactivate = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });

    // T-02-04 mitigation: self-lockout guard comes BEFORE any DB write.
    if (req.user && Number(req.user.id) === id) {
      return res.status(409).json({ error: 'self_lockout_forbidden' });
    }

    const ok = await userModel.setActive(id, 0);
    if (!ok) return res.status(404).json({ error: 'user_not_found' });

    const row = await userModel.findById(id);
    return res.status(200).json(sanitizeUser(row));
  } catch (err) {
    return next(err);
  }
};
