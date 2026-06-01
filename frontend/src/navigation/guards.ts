/**
 * Route-guard helpers — single source of truth for "which tabs does THIS user
 * see?" and "which actions can THIS user perform on a given page?".
 *
 * AppTabs calls `canAccessTab(tab, user)` at render time and only mounts
 * tabs that pass. Screens call `canDoAction(user, page, action)` to gate
 * the New / Edit / Delete buttons.
 *
 * Permission model (per-page CRUD):
 *   - `<page>.view`     — see the tab and its data
 *   - `<page>.create`   — show the New / + button
 *   - `<page>.edit`     — show the Edit action
 *   - `<page>.delete`   — show the Delete action
 *   - `*` wildcard      — grants everything (non-admin "super staff")
 *   - role = 'admin'    — bypasses all checks
 *
 * Backend roleMiddleware is the actual security boundary — hiding tabs / UI
 * here is UX (no broken pages) plus surface-reduction.
 */

import type {
  Permission, PermissionAction, PermissionPage, Role,
} from '../../../shared/types/user';
import type { TabName } from './types';
import { permKey } from '../constants/roles';

/**
 * Tabs that ONLY admins (or wildcard) ever see — regardless of any
 * permission grants. Dashboard is admin-only by design (overview + active
 * users metadata).
 */
const ADMIN_ONLY_TABS: TabName[] = ['Dashboard'];

/**
 * Maps a tab to the PermissionPage that gates its `.view` permission.
 * A tab not in this map is visible to all authenticated users (not in use
 * today — every page goes through this mapping).
 *
 * Notes:
 *   - LedgerMaster + OtherLedgers share `ledgermaster` (same all-groups view).
 *   - Customers, OwnerMaster, AgentMaster have their own page keys so an
 *     admin can grant access to one ledger sub-page but not the others.
 *   - ItemMaster / ItemGroup / ItemCategory each have their own page key
 *     for the same reason.
 *   - Billing maps to `voucher`.
 *
 * The backend `/api/ledger-master` routes accept ANY of
 * { ledgermaster | customermaster | ownermaster | agentmaster }.<action>
 * so users only need the perm for the sub-page they actually visit.
 */
const TAB_TO_PAGE: Partial<Record<TabName, PermissionPage>> = {
  Bilty: 'bilty',
  Freight: 'freight',
  // Billing tab handled specially below — visible if user has any voucher.*
  // perm OR daybook.view (so daybook-only users can still reach the daybook).
  LedgerMaster: 'ledgermaster',
  Customers: 'customermaster',
  OtherLedgers: 'ledgermaster', // Other ledgers sharing the general ledger master perm
  OwnerMaster: 'ownermaster',
  AgentMaster: 'agentmaster',
  ItemMaster: 'itemmaster',
  ItemGroup: 'itemgroup',
  ItemCategory: 'itemcategory',
  VehicleMaster: 'vehiclemaster',
  DestinationMaster: 'destinationmaster',
  BranchMaster: 'branchmaster',
  ZoneMaster: 'zonemaster',
  LedgerGroups: 'ledgergroup',
  Users: 'user',
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
  if (isAdmin(user)) return true;
  if (ADMIN_ONLY_TABS.includes(tab)) return false;

  // Billing groups Vouchers + Daybook. Either route's view perm grants the
  // tab so a daybook-only user can still reach the daybook page.
  if (tab === 'Billing') {
    return hasPerm(user, 'voucher.view') || hasPerm(user, 'daybook.view');
  }

  // The Bilty tab also mounts (silently, hidden from nav) for users with
  // `voucher.view` so the Daybook can navigate to BiltyForm for editing
  // bilty rows. The TopNavBar still hides "Bilty" unless the user has
  // `bilty.view` — this is purely a navigation-target enabler.
  if (tab === 'Bilty') {
    return hasPerm(user, 'bilty.view') || hasPerm(user, 'voucher.view');
  }

  const page = TAB_TO_PAGE[tab];
  if (!page) return true; // unmapped tab = open to all authenticated users
  return hasPerm(user, permKey(page, 'view'));
}

/**
 * Inside-screen action gate. Used by screens to decide whether to show
 * New / Edit / Delete buttons.
 *
 * Example: `canDoAction(user, 'bilty', 'edit')` returns true if the user
 * has `bilty.edit` (or `*`, or is an admin).
 */
export function canDoAction(
  user: { role: Role; permissions?: string[] } | null,
  page: PermissionPage,
  action: PermissionAction
): boolean {
  if (!user) return false;
  if (isAdmin(user)) return true;
  // Non-view actions implicitly require view — you can't edit/delete a row
  // you can't see in the first place.
  if (action !== 'view' && !hasPerm(user, permKey(page, 'view'))) return false;
  return hasPerm(user, permKey(page, action));
}

/**
 * Pick the tab the app should land on right after login.
 * Follows the nav-bar order — Dashboard → Ledger dropdown items → Bilty →
 * Freight → Billing — and returns the first tab the user can actually use.
 *
 * Returns `undefined` for users who have nothing accessible (caller can
 * fall back to React Navigation's default first-screen behaviour).
 */
export function pickInitialTab(
  user: { role: Role; permissions?: string[] } | null
): TabName | undefined {
  if (!user) return undefined;
  if (isAdmin(user)) return 'Dashboard';

  // 1. Ledger dropdown items, in the order shown in the dropdown.
  const ledgerOrder: TabName[] = [
    'LedgerMaster', 'Customers', 'OtherLedgers',
    'OwnerMaster', 'AgentMaster',
    'ItemMaster', 'ItemGroup', 'ItemCategory',
    'VehicleMaster', 'DestinationMaster', 'BranchMaster', 'ZoneMaster', 'LedgerGroups',
  ];
  for (const t of ledgerOrder) {
    if (canAccessTab(t, user)) return t;
  }

  // 2. Bilty — strict bilty.view only (the tab also mounts for voucher.view
  // users so the Daybook can navigate to BiltyForm, but they shouldn't land
  // there at startup).
  if (hasPerm(user, 'bilty.view')) return 'Bilty';

  // 3. Freight, then Billing (Daybook for voucher-only users).
  if (canAccessTab('Freight', user)) return 'Freight';
  if (canAccessTab('Billing', user)) return 'Billing';

  return undefined;
}
