// Shared types for /api/reports/summary — the only surviving reports
// endpoint. Powers dashboard tile counts (DashboardScreen, ProfilePanel).
// The Reports page itself was retired; daybook took its slot in the
// permission vocabulary.

export interface ReportSummary {
  bilties: number;
  freight_memos: number;
  ledger_groups: number;
  active_users: number;
  permissions: {
    bilty: boolean;
    freight: boolean;
    daybook: boolean;
    ledgergroup: boolean;
    user: boolean;
  };
}
