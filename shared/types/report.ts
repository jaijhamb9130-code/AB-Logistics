/**
 * Shared report types (Phase 6). Mirrored by backend reportsController.
 *
 * Permission gating is expressed in the `permissions` sub-object — the UI
 * uses it to render "—" for stats the user can't see, instead of racing
 * separate permission checks on the client.
 */

import type { BiltyListItem } from './bilty';
import type { OrderListItem } from './order';

export interface ReportSummaryPermissions {
  bilty: boolean;
  freight: boolean;
  order: boolean;
  vehicle: boolean;
  report: boolean;
}

export interface ReportSummary {
  bilties: number;
  freight_memos: number;
  orders: number;
  vehicles: number;
  active_users: number;
  permissions: ReportSummaryPermissions;
}

export interface ReportHistoryPermissions {
  bilty: boolean;
  order: boolean;
}

export interface ReportHistory {
  bilties: BiltyListItem[];
  orders: OrderListItem[];
  permissions: ReportHistoryPermissions;
}
