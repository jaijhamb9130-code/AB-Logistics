/**
 * Shared user + role types (D-02).
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
 * Canonical permission vocabulary — one permission per page.
 *
 * Convention:
 *   - For editable pages: `<entity>.edit` — granting it implies full access
 *     (read + create + edit + delete on that page).
 *   - For view-only pages (Freight, Reports): `<entity>.access` — they have
 *     no editing concept; the permission simply controls tab visibility.
 *   - Users page: `user.manage` — admin-trust permission.
 *   - `*` wildcard grants everything.
 *
 * The backend validates incoming permission arrays against this list; the
 * frontend mirrors it in roles.ts for the PermissionPicker.
 */
export type Permission =
  | 'bilty.edit'
  | 'freight.access'
  | 'report.access'
  | 'partymaster.edit'
  | 'ownermaster.edit'
  | 'agentmaster.edit'
  | 'itemmaster.edit'
  | 'vehiclemaster.edit'
  | 'destinationmaster.edit'
  | 'ledgergroup.edit'
  | 'voucher.edit'
  | 'user.manage'
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
