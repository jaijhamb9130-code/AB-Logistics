/**
 * Route-guard helpers (D-19, AUTH-06).
 *
 * The single source of truth for "which tabs does THIS user see?".
 * AppTabs uses `canAccessTab` at render time; AppNavigator uses
 * `isAuthenticated` from AuthContext to pick AuthStack vs AppTabs.
 *
 * T-01-19 / T-01-20 defence-in-depth only — backend roleMiddleware is the
 * real enforcement; hiding the tab is a UX + surface-reduction measure.
 */

import type { Role } from '../../../shared/types/user';
import type { TabName } from './types';

/**
 * Tabs that only admins are allowed to see.
 * Staff users must NEVER have these rendered.
 */
const ADMIN_ONLY_TABS: TabName[] = ['Users'];

export function canAccessTab(
  tab: TabName,
  user: { role: Role } | null
): boolean {
  if (!user) return false;
  if (ADMIN_ONLY_TABS.includes(tab)) {
    return user.role === 'admin';
  }
  return true;
}
