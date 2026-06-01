/**
 * Re-export the shared Role + User types from /shared/types
 * plus frontend-specific permission constants.
 *
 * Per-page CRUD model: every page has 4 permissions —
 *   `<page>.view`     — show the tab + read data
 *   `<page>.create`   — show the New / + button
 *   `<page>.edit`     — show the Edit action
 *   `<page>.delete`   — show the Delete action
 *
 * Admin (role='admin') and wildcard ('*') bypass all checks. Kept manually
 * in sync with backend/src/constants/permissions.js.
 */

export type {
  Role, User, Permission, PermissionPage, PermissionAction,
} from '../../../shared/types/user';
import type { Permission, PermissionPage, PermissionAction, Role } from '../../../shared/types/user';

/** Pages that appear on the Permissions picker. Order = render order. */
export const PERMISSION_PAGES: readonly PermissionPage[] = [
  'bilty',
  'freight',
  'voucher',
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
] as const;

/** All four CRUD actions, render order on each page row. */
export const PERMISSION_ACTIONS: readonly PermissionAction[] = [
  'view',
  'create',
  'edit',
  'delete',
] as const;

/** User-facing label per page key. */
export const PAGE_LABELS: Record<PermissionPage, string> = {
  bilty: 'Bilty',
  freight: 'Freight',
  voucher: 'Vouchers',
  daybook: 'Daybook',
  ledgermaster: 'Ledger Master',
  customermaster: 'Customer Master',
  ownermaster: 'Owner Master',
  agentmaster: 'Agent Master',
  itemmaster: 'Item Master',
  itemgroup: 'Item Group',
  itemcategory: 'Item Category',
  vehiclemaster: 'Vehicle Master',
  destinationmaster: 'Destination Master',
  branchmaster: 'Branch Master',
  zonemaster: 'Zone Master',
  ledgergroup: 'Ledger Groups',
  user: 'Users',
};

// Re-export the shared `view-only` page list so the PermissionPicker can
// render only the View checkbox for these pages.
export { VIEW_ONLY_PAGES } from '../../../shared/types/user';

/** User-facing label per CRUD action. */
export const ACTION_LABELS: Record<PermissionAction, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
};

/** Build the concrete permission string for a (page, action) pair. */
export function permKey(page: PermissionPage, action: PermissionAction): Permission {
  return `${page}.${action}` as Permission;
}

/** Flat list of every concrete (non-wildcard) permission string. */
export const PERMISSION_LIST: readonly Exclude<Permission, '*'>[] =
  PERMISSION_PAGES.flatMap((p) =>
    PERMISSION_ACTIONS.map((a) => permKey(p, a) as Exclude<Permission, '*'>)
  );
  
/** User-facing label for a full permission string (e.g. 'bilty.view' -> 'Bilty (View)') */
export function getPermissionLabel(p: Permission): string {
  if (p === '*') return 'All Permissions';
  const parts = p.split('.');
  if (parts.length !== 2) return p;
  const page = parts[0] as PermissionPage;
  const action = parts[1] as PermissionAction;
  const pageLabel = PAGE_LABELS[page] || page;
  const actionLabel = ACTION_LABELS[action] || action;
  return `${pageLabel} (${actionLabel})`;
}

export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'staff', label: 'Staff' },
];
