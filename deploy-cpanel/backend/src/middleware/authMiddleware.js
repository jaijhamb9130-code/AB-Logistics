'use strict';

const { verifyAccessToken } = require('../utils/jwt');
const userModel = require('../models/userModel');

// Verify Bearer access token; attach sanitized req.user (D-15).
// T-01-08 mitigation: only the signed secret validates the token.
module.exports = async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });

  try {
    const decoded = verifyAccessToken(token);
    const user = await userModel.findById(decoded.sub);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'invalid_token' });
    }
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
};
