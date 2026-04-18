'use strict';

const env = require('../config/env');
const userModel = require('../models/userModel');
const { comparePassword } = require('../utils/password');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require('../utils/jwt');

const REFRESH_COOKIE = 'refreshToken';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7d, matches JWT TTL

// T-01-09 mitigation: httpOnly, sameSite=strict, path scoped, secure in prod.
function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.NODE_ENV === 'production',
    path: '/api/auth',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  };
}

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
  };
}

// POST /api/auth/login
exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
      return res.status(400).json({ error: 'invalid_body' });
    }

    const row = await userModel.findByUsername(username.trim());
    // T-01-12 mitigation — generic message whether user missing or password wrong.
    if (!row) return res.status(401).json({ error: 'invalid_credentials' });

    const ok = await comparePassword(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

    if (!row.is_active) return res.status(403).json({ error: 'account_disabled' });

    const accessToken = signAccessToken({ id: row.id, role: row.role });
    const refreshToken = signRefreshToken({ id: row.id });
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());

    return res.status(200).json({
      user: sanitizeUser(row),
      accessToken,
    });
  } catch (err) {
    return next(err);
  }
};

// POST /api/auth/refresh
exports.refresh = async (req, res, next) => {
  try {
    const token = req.cookies && req.cookies[REFRESH_COOKIE];
    if (!token) return res.status(401).json({ error: 'missing_refresh_token' });

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch {
      return res.status(401).json({ error: 'invalid_refresh_token' });
    }

    const row = await userModel.findById(decoded.sub);
    if (!row || !row.is_active) return res.status(401).json({ error: 'invalid_refresh_token' });

    const accessToken = signAccessToken({ id: row.id, role: row.role });
    return res.status(200).json({ accessToken });
  } catch (err) {
    return next(err);
  }
};

// POST /api/auth/logout
exports.logout = (_req, res) => {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  return res.status(204).send();
};

// GET /api/auth/me
exports.me = (req, res) => {
  // authMiddleware already loaded + sanitized via findById
  return res.status(200).json({
    id: req.user.id,
    username: req.user.username,
    role: req.user.role,
    permissions: parsePerms(req.user.permissions),
    is_active: Boolean(req.user.is_active),
    created_at: req.user.created_at,
  });
};
