'use strict';

/**
 * Canonical permission vocabulary for AB Logistics.
 *
 * Single source of truth for what strings may be stored in users.permissions
 * (JSON column). The frontend mirrors this list in shared/types/user.ts so
 * clients and server share the same typed vocabulary.
 *
 * Admins bypass permission checks (see roleMiddleware), and the wildcard '*'
 * grants a non-admin user universal access. Both are valid values here.
 *
 * Phase 02 — T-02-05 mitigation: any permission string written through
 * /api/users must pass isValidPermission(), else 400 invalid_permissions.
 */

const PERMISSIONS = Object.freeze([
  'bilty.read',
  'bilty.edit',
  'freight.read',
  'order.read',
  'order.edit',
  'vehicle.read',
  'vehicle.edit',
  'report.read',
]);

const WILDCARD = '*';

function isValidPermission(p) {
  return typeof p === 'string' && (p === WILDCARD || PERMISSIONS.includes(p));
}

function isValidPermissionArray(arr) {
  return Array.isArray(arr) && arr.every(isValidPermission);
}

module.exports = {
  PERMISSIONS,
  WILDCARD,
  isValidPermission,
  isValidPermissionArray,
};
