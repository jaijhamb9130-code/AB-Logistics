/**
 * Pure validators for the New/Edit User form (plan 02-02).
 *
 * These mirror the backend validators (plan 02-01) so the UI can give
 * instant inline feedback — but the backend (T-02-10) is authoritative
 * and every `validateCreateUser` error has an equivalent server error code.
 *
 * Error strings are stable "codes" (not copy) so components can map them to
 * localized/consistent user-visible messages.
 */

import type { Permission, Role } from '../../../shared/types/user';

// Same pattern as backend/src/constants/permissions.js username regex.
const USERNAME_RE = /^[a-zA-Z0-9_.\-]{3,64}$/;

export type FieldError =
  | 'required'
  | 'too_short'
  | 'too_long'
  | 'invalid_format'
  | 'invalid_value';

export function validateUsername(v: string): FieldError | null {
  if (!v) return 'required';
  if (v.length < 3) return 'too_short';
  if (v.length > 64) return 'too_long';
  if (!USERNAME_RE.test(v)) return 'invalid_format';
  return null;
}

export function validatePassword(v: string): FieldError | null {
  if (!v) return 'required';
  if (v.length < 8) return 'too_short';
  return null;
}

export function validateRole(v: string): FieldError | null {
  return v === 'admin' || v === 'staff' ? null : 'invalid_value';
}

export function validatePermissions(v: Permission[]): FieldError | null {
  if (!Array.isArray(v) || v.length === 0) return 'required';
  return null;
}

export interface CreateUserErrors {
  username?: FieldError;
  password?: FieldError;
  role?: FieldError;
  permissions?: FieldError;
}

export interface CreateUserInput {
  username: string;
  password: string;
  role: Role | '';
  permissions: readonly Permission[] | Permission[];
}

export function validateCreateUser(input: CreateUserInput): CreateUserErrors {
  const errs: CreateUserErrors = {};

  const u = validateUsername(input.username);
  if (u) errs.username = u;

  const p = validatePassword(input.password);
  if (p) errs.password = p;

  const r = validateRole(input.role as string);
  if (r) errs.role = r;

  const perms = validatePermissions(input.permissions as Permission[]);
  if (perms) errs.permissions = perms;

  return errs;
}
