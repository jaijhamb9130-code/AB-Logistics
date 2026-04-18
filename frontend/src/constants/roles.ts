/**
 * Re-export the shared Role + User types from /shared/types
 * plus frontend-specific permission constants.
 *
 * Phase 02 additions:
 *  - PERMISSION_LIST   — canonical non-wildcard permissions rendered by PermissionPicker.
 *  - PERMISSION_LABELS — user-facing copy keyed by Permission (incl. '*').
 *  - ROLE_OPTIONS      — value/label pairs for role radio groups.
 *
 * Kept manually in sync with backend/src/constants/permissions.js (plan 02-01).
 */

export type { Role, User, Permission } from '../../../shared/types/user';
import type { Permission, Role } from '../../../shared/types/user';

/** Legacy Phase-1 constant kept for back-compat; superseded by PERMISSION_LIST below. */
export const PERMISSIONS = {
  BILTY_CREATE: 'bilty:create',
  USER_MANAGE: 'user:manage',
} as const;

// ---------------------------------------------------------------------------
// Phase 02 — canonical permission vocabulary (mirror of backend).
// ---------------------------------------------------------------------------

export const PERMISSION_LIST: readonly Exclude<Permission, '*'>[] = [
  'bilty.read',
  'bilty.edit',
  'freight.read',
  'order.read',
  'order.edit',
  'vehicle.read',
  'vehicle.edit',
  'report.read',
] as const;

export const PERMISSION_LABELS: Record<Permission, string> = {
  'bilty.read': 'Bilty · Read',
  'bilty.edit': 'Bilty · Edit',
  'freight.read': 'Freight · Read',
  'order.read': 'Order · Read',
  'order.edit': 'Order · Edit',
  'vehicle.read': 'Vehicle · Read',
  'vehicle.edit': 'Vehicle · Edit',
  'report.read': 'Report · Read',
  '*': 'All (wildcard)',
};

export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'staff', label: 'Staff' },
];
