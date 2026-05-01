/**
 * Shared report types. Mirrored by backend reportsController.
 * Permission gating is expressed in `permissions` so the UI can render
 * "—" for stats the user can't see.
 */

import type { BiltyListItem } from './bilty';

export interface ReportSummaryPermissions {
  bilty: boolean;
  freight: boolean;
  report: boolean;
  ledgergroup: boolean;
}

export interface ReportSummary {
  bilties: number;
  freight_memos: number;
  ledger_groups: number;
  active_users: number;
  permissions: ReportSummaryPermissions;
}

export interface ReportHistoryPermissions {
  bilty: boolean;
}

export interface ReportHistory {
  bilties: BiltyListItem[];
  permissions: ReportHistoryPermissions;
}
