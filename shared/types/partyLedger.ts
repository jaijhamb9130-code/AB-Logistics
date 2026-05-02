// Shared type for party_ledger table — Party / Owner / Agent share one schema,
// differentiated by `type`. UI hides this column; API requires it.

export type PartyLedgerType = 'party' | 'owner' | 'agent';

export interface PartyLedgerItem {
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
  tally_master_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PartyLedgerSearchResult {
  id: number;
  ledger_group_id: number;
  name: string;
  city: string | null;
  gst_no: string | null;
}

export interface CreatePartyLedgerRequest {
  ledger_group_id: number;
  name: string;
  gst_no?: string | null;
  pan_no?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pincode?: string | null;
}

export type UpdatePartyLedgerRequest = Omit<CreatePartyLedgerRequest, 'ledger_group_id'>;

