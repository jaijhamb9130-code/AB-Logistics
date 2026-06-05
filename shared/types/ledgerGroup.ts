// Ledger group (Tally chart-of-accounts node). The `ledger_group` table is
// Docker-managed; this app reads/writes to it via the API.
//
// `parent_id = null` ⇒ a top-level "Primary" group.

export interface LedgerGroupItem {
  id: number;
  group_name: string;
  parent_id: number | null;
  parent_name: string | null;
  /** 1 = one of the 28 permanent (non-editable, non-deletable) top-level groups. */
  is_system: number;
  created_at: string;
}

export interface CreateLedgerGroupRequest {
  group_name: string;
  parent_id?: number | null;
}

export type UpdateLedgerGroupRequest = CreateLedgerGroupRequest;
