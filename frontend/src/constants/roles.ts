/**
 * Re-export the shared Role + User types from /shared/types
 * plus frontend-specific permission constants.
 */

export type { Role, User } from '../../../shared/types/user';

export const PERMISSIONS = {
  BILTY_CREATE: 'bilty:create',
  USER_MANAGE: 'user:manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
