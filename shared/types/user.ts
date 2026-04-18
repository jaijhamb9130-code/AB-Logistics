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
