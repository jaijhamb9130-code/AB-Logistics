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

// Non-view actions implicitly require view on the same page — you can't
// edit/delete what you can't see. Returns true if `userPerms` satisfies a
// required permission AND any implicit prereq.
function satisfies(userPerms, required) {
  if (!userPerms.includes(required)) return false;
  const m = /^([a-z]+)\.(view|create|edit|delete)$/.exec(required);
  if (m && m[2] !== 'view') {
    return userPerms.includes(`${m[1]}.view`);
  }
  return true;
}

exports.requirePermission = (permOrPerms) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
  const perms = normalizePerms(req.user.permissions);
  // Admins always pass; wildcard '*' always passes.
  if (req.user.role === 'admin' || perms.includes('*')) {
    return next();
  }

  const required = Array.isArray(permOrPerms) ? permOrPerms : [permOrPerms];
  if (required.some((p) => satisfies(perms, p))) {
    return next();
  }

  return res.status(403).json({ error: 'forbidden' });
};
