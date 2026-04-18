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
 * Phase 02 — canonical permission vocabulary mirrored from
 * backend/src/constants/permissions.js. The backend validates all
 * incoming permission arrays against the same list plus '*'.
 */
export type Permission =
  | 'bilty.read'
  | 'bilty.edit'
  | 'freight.read'
  | 'order.read'
  | 'order.edit'
  | 'vehicle.read'
  | 'vehicle.edit'
  | 'report.read'
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
