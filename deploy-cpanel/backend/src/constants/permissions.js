'use strict';

/**
 * Canonical permission vocabulary — per-page CRUD model.
 *
 * Single source of truth for what strings may be stored in users.permissions.
 * The frontend mirrors this list in shared/types/user.ts + roles.ts so
 * clients and server share the same vocabulary.
 *
 * Convention:  `<page>.<action>`  where action ∈ { view, create, edit, delete }.
 *
 * Admins bypass permission checks (see roleMiddleware). The wildcard '*'
 * grants a non-admin user universal access. Both remain valid here.
 *
 * Any permission string written through /api/users must pass
 * isValidPermission(), else 400 invalid_permissions.
 */

const PERMISSION_PAGES = Object.freeze([
  'bilty',
  'freight',
  'voucher',
  // `daybook` only meaningfully exposes `daybook.view`; row-level CRUD on
  // daybook entries reuses the voucher.* perms because each daybook row
  // IS a voucher.
  'daybook',
  'ledgermaster',
  'customermaster',
  'ownermaster',
  'agentmaster',
  'itemmaster',
  'itemgroup',
  'itemcategory',
  'vehiclemaster',
  'destinationmaster',
  'branchmaster',
  'zonemaster',
  'ledgergroup',
  'user',
]);

// Pages where only the `.view` action is meaningful. Other action strings
// (create/edit/delete) are still valid in the permission vocabulary so
// arrays validate, but they're not gated to any backend route.
const VIEW_ONLY_PAGES = Object.freeze(['daybook']);

const PERMISSION_ACTIONS = Object.freeze(['view', 'create', 'edit', 'delete']);

// Generated `${page}.${action}` strings — 12 × 4 = 48 entries.
const PERMISSIONS = Object.freeze(
  PERMISSION_PAGES.flatMap((p) => PERMISSION_ACTIONS.map((a) => `${p}.${a}`))
);

const WILDCARD = '*';

function isValidPermission(p) {
  return typeof p === 'string' && (p === WILDCARD || PERMISSIONS.includes(p));
}

function isValidPermissionArray(arr) {
  return Array.isArray(arr) && arr.every(isValidPermission);
}

module.exports = {
  PERMISSION_PAGES,
  PERMISSION_ACTIONS,
  PERMISSIONS,
  VIEW_ONLY_PAGES,
  WILDCARD,
  isValidPermission,
  isValidPermissionArray,
};
