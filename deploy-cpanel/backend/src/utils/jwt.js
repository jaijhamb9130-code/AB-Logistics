'use strict';

// D-13 — JWT-based auth. Access 15m, refresh 7d. Secrets come from env only (T-01-08).
const jwt = require('jsonwebtoken');
const env = require('../config/env');

exports.signAccessToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
  });

exports.signRefreshToken = (user) =>
  jwt.sign({ sub: user.id, typ: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL,
  });

exports.verifyAccessToken = (token) => jwt.verify(token, env.JWT_ACCESS_SECRET);
exports.verifyRefreshToken = (token) => jwt.verify(token, env.JWT_REFRESH_SECRET);
