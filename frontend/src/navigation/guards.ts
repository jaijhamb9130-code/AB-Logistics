/**
 * Route-guard helpers — single source of truth for "which tabs does THIS user
 * see?". AppTabs calls `canAccessTab(tab, user)` at render time and only mounts
 * tabs that pass.
 *
 * Rules:
 *   - Admins see everything (role === 'admin' OR perms include '*').
 *   - Staff see a tab only if their permissions include the tab's required
 *     permission listed in TAB_PERMISSIONS.
 *   - Tabs not in TAB_PERMISSIONS are visible to everyone (e.g. Dashboard).
 *
 * Backend roleMiddleware is the actual security boundary — hiding tabs here
 * is UX (no broken pages) plus surface-reduction.
 */

import type { Permission, Role } from '../../../shared/types/user';
import type { TabName } from './types';

/**
 * Tabs that ONLY admins (or wildcard) ever see — regardless of any
 * permission grants. Dashboard is admin-only by design (overview + active
 * users metadata).
 */
const ADMIN_ONLY_TABS: TabName[] = ['Dashboard'];

/**
 * Per-tab permission requirement for staff users. Admin always passes.
 * A tab not listed here AND not in ADMIN_ONLY_TABS = visible to all
 * authenticated users.
 *
 * Convention: editable pages use `<entity>.edit` (implies full access).
 * View-only pages use `<entity>.access`. Users page uses `user.manage`.
 */
const TAB_PERMISSIONS: Partial<Record<TabName, Permission>> = {
  Bilty: 'bilty.edit',
  Freight: 'freight.access',
  Billing: 'voucher.edit',
  Reports: 'report.access',
  PartyMaster: 'partymaster.edit',
  OwnerMaster: 'ownermaster.edit',
  AgentMaster: 'agentmaster.edit',
  ItemMaster: 'itemmaster.edit',
  VehicleMaster: 'vehiclemaster.edit',
  DestinationMaster: 'destinationmaster.edit',
  LedgerGroups: 'ledgergroup.edit',
  Users: 'user.manage',
};

function isAdmin(user: { role: Role; permissions?: string[] }): boolean {
  if (user.role === 'admin') return true;
  return Array.isArray(user.permissions) && user.permissions.includes('*');
}

function hasPerm(user: { permissions?: string[] }, perm: Permission): boolean {
  if (!Array.isArray(user.permissions)) return false;
  return user.permissions.includes('*') || user.permissions.includes(perm);
}

export function canAccessTab(
  tab: TabName,
  user: { role: Role; permissions?: string[] } | null
): boolean {
  if (!user) return false;

  // Admin / wildcard sees everything.
  if (isAdmin(user)) return true;

  // Admin-only tabs are off-limits to staff regardless of permissions.
  if (ADMIN_ONLY_TABS.includes(tab)) return false;

  // If the tab requires a specific permission, check it.
  const required = TAB_PERMISSIONS[tab];
  if (required) return hasPerm(user, required);

  // No requirement listed = visible to all authenticated users.
  return true;
}

/**
 * Inside-screen action gate — used by screens to decide whether to show
 * New / Edit / Delete buttons. Same rules as canAccessTab but takes any
 * Permission string.
 */
export function canDoAction(
  user: { role: Role; permissions?: string[] } | null,
  perm: Permission
): boolean {
  if (!user) return false;
  if (isAdmin(user)) return true;
  return hasPerm(user, perm);
}
