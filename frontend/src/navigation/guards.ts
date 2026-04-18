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
 *
 * Phase 3 note: the Bilty tab is visible to all authenticated users. Backend
 * still enforces bilty.read / bilty.edit per endpoint — the client-side gate
 * is pure UX. Users without bilty.read will see the tab but API calls 403.
 *
 * Phase 6 note: the Reports tab is visible to all authenticated users; the
 * ReportsScreen itself renders only permitted tabs (bilty/order) based on
 * the backend's per-user permission payload.
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
