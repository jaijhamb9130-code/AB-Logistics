// Shared type for ledger_master table. Each ledger row is scoped to a
// ledger_group via `ledger_group_id`; the per-row UI surfaces this through
// the Customers / Owner / Agent / Other Ledgers pages.

export type LedgerMasterType = 'party' | 'owner' | 'agent';

export interface LedgerMasterItem {
  id: number;
  ledger_group_id: number;
  name: string;
  gst_no: string | null;
  pan_no: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;
  // Tally-style ledger config — bill-by-bill toggle and opening balance
  // (amount + Dr/Cr).
  billbybill?: 'Yes' | 'No';
  opening_balance?: number | string | null;
  opening_balance_type?: 'Dr' | 'Cr';
  tally_master_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LedgerMasterSearchResult {
  id: number;
  ledger_group_id: number;
  name: string;
  city: string | null;
  gst_no: string | null;
}

export interface CreateLedgerMasterRequest {
  ledger_group_id: number;
  name: string;
  gst_no?: string | null;
  pan_no?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pincode?: string | null;
  billbybill?: 'Yes' | 'No';
  opening_balance?: number | string | null;
  opening_balance_type?: 'Dr' | 'Cr';
}

// Update accepts the same shape as Create plus an optional ledger_group_id
// for re-classifying a row (Other Ledgers bulk-edit modal uses this to move
// a ledger between groups).
export interface UpdateLedgerMasterRequest extends Omit<CreateLedgerMasterRequest, 'ledger_group_id'> {
  ledger_group_id?: number;
}
