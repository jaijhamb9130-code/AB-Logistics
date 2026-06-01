/**
 * Shared user + role types.
 * Imported by both frontend (Expo) and backend (Express).
 */

export type Role = 'admin' | 'staff';

export interface User {
  id: number;
  username: string;
  role: Role;
  permissions: string[];
  is_active: boolean;
  created_at: string;
}

/**
 * Per-page CRUD permission vocabulary.
 *
 * Convention:  `<page>.<action>`  where action ∈ { view, create, edit, delete }.
 *
 *   view    — see the tab and its data
 *   create  — show the New / + button on that page
 *   edit    — show the Edit action on each row
 *   delete  — show the Delete action on each row
 *
 * Admins (role = 'admin') bypass all checks; the wildcard '*' grants
 * everything for non-admin users. Both stay valid here.
 *
 * Pages list — kept in lockstep with PERMISSION_PAGES in
 * backend/src/constants/permissions.js and frontend/src/constants/roles.ts.
 */
export type PermissionPage =
  | 'bilty'
  | 'freight'
  | 'voucher'
  // `daybook` only meaningfully supports `daybook.view` — row CRUD inside
  // the daybook is gated by the matching voucher.* perm, since each row is
  // a voucher record.
  | 'daybook'
  | 'ledgermaster'
  | 'customermaster'
  | 'ownermaster'
  | 'agentmaster'
  | 'itemmaster'
  | 'itemgroup'
  | 'itemcategory'
  | 'vehiclemaster'
  | 'destinationmaster'
  | 'branchmaster'
  | 'zonemaster'
  | 'ledgergroup'
  | 'user';

/**
 * Pages that only meaningfully expose a `view` permission. The PermissionPicker
 * renders just the View column for these, hiding create / edit / delete
 * cells (which would never grant anything). Backend treats other actions
 * as no-ops for these pages.
 */
export const VIEW_ONLY_PAGES: ReadonlyArray<PermissionPage> = ['daybook'];

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';

/**
 * Concrete permission strings — every (page, action) combination plus the
 * wildcard. Generated at the type level so the type stays in sync with the
 * constants without having to enumerate 48 strings by hand.
 */
export type Permission =
  | `${PermissionPage}.${PermissionAction}`
  | '*';

export interface UserListItem {
  id: number;
  username: string;
  role: Role;
  permissions: Permission[];
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface CreateUserRequest {
  username: string;   // 3-64 chars, [a-zA-Z0-9_.-]
  password: string;   // >= 8 chars
  role: Role;
  permissions: Permission[];
}

export interface UpdateUserRequest {
  username?: string;
  password?: string;
  role?: Role;
  permissions?: Permission[];
}
