'use strict';

// D-16 / BE-05 / T-01-10 mitigation — role & permission guards for admin-only endpoints.

function normalizePerms(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

exports.requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'forbidden' });
  }
  return next();
};

exports.requirePermission = (perm) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
  const perms = normalizePerms(req.user.permissions);
  // Admins always pass; wildcard '*' always passes.
  if (req.user.role === 'admin' || perms.includes('*') || perms.includes(perm)) {
    return next();
  }
  return res.status(403).json({ error: 'forbidden' });
};
