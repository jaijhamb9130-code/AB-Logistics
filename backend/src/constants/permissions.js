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

// One permission per page. Editable pages use .edit (implies read+create+
// edit+delete). View-only pages (Freight, Reports) use .access. Users page
// uses .manage. Admin can mix and match these on each staff user.
const PERMISSIONS = Object.freeze([
  'bilty.edit',
  'freight.access',
  'report.access',
  'partymaster.edit',
  'ownermaster.edit',
  'agentmaster.edit',
  'itemmaster.edit',
  'vehiclemaster.edit',
  'destinationmaster.edit',
  'ledgergroup.edit',
  'voucher.edit',
  'user.manage',
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
