/**
 * Tally-style voucher types — shared between frontend and backend.
 *
 * Sign convention (driven by VchType.deemed_positive):
 *   YES (Sales/Debit Note)     → Party Dr (+grandTotal), Goods Cr, inventory negative
 *   NO  (Purchase/Credit Note) → Party Cr (-grandTotal), Goods Dr, inventory positive
 *   null (Receipt/Payment/Journal/Contra) → journal mode, no items
 *
 * SUM(ledgerEntries.amount per voucher) = 0 always.
 */

export type DeemedPositive = 'YES' | 'NO' | null;

export interface VchType {
  id: number;
  name: string;
  parent_id: number | null;
  parent_name: string | null;
  deemed_positive: DeemedPositive;
  is_system: 0 | 1;
}

export interface OtherLedger {
  id: number;
  name: string;
  ledger_group_id: number;
  ledger_group_name: string | null;
  billbybill: 'Yes' | 'No';
}

// ── Create payload ──────────────────────────────────────────────────────────

export interface VoucherItemBatch {
  batch_name?: string | null;
  qty: number;
  rate: number;
  amount: number;
}

export interface VoucherItemInput {
  item_id: number;
  qty: number;
  rate: number;
  amount: number;
  gst_rate?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  batch_rows?: VoucherItemBatch[] | null;
}

export interface VoucherLedgerInput {
  ledger_id: number;
  amount: number;
}

export interface BillAllocationInput {
  type: 'New' | 'Agr.' | 'On Account';
  refno?: string;
  amount: number;
  direction?: 'Dr' | 'Cr';
}

export interface CreateVoucherRequest {
  vch_type_id?: number | null;
  vch_no?: string | null;
  vch_date?: string | null;          // YYYY-MM-DD
  ledger_master_id: number;
  remark?: string | null;
  is_igst?: boolean;
  items?: VoucherItemInput[];
  ledgers?: VoucherLedgerInput[];
  bill_allocation?: BillAllocationInput[];
}

// ── List + detail responses ─────────────────────────────────────────────────

export interface VoucherListItem {
  id: number;
  vch_no: string | null;
  vch_date: string | null;
  amount: number | string;
  remark: string | null;
  party_name: string | null;
  vch_type_name: string | null;
  vch_subtype_name: string | null;
  created_at: string;
}

export interface VoucherListResponse {
  data: VoucherListItem[];
  total: number;
  page: number;
  limit: number;
}

export interface VoucherInventoryEntry {
  id: number;
  led_id: number;
  item_id: number;
  qty: number | string;
  rate: number | string;
  amount: number | string;
  gst_rate: number | string;
  item_name: string | null;
  item_batch: 'Yes' | 'No' | null;
  batchRows: { id: number; batch_name: string | null; qty: number | string; rate: number | string; amount: number | string }[];
}

export interface VoucherLedgerEntry {
  id: number;
  vch_id: number;
  ledger_id: number | null;
  amount: number | string;
  ledger_name: string | null;
  inventoryEntries: VoucherInventoryEntry[];
}

export interface VoucherBillAllocation {
  id: number;
  billname: string | null;
  amount: number | string;
  ledger: number | null;
}

export interface VoucherDetail extends VoucherListItem {
  vch_type_id: number | null;
  ledger_master_id: number;
  deemed_positive: DeemedPositive;
  ledgerEntries: VoucherLedgerEntry[];
  billAllocations: VoucherBillAllocation[];
}

// ── Daybook + pending refs ──────────────────────────────────────────────────

export interface DaybookEntry {
  id: number;
  vch_no: string | null;
  vch_date: string | null;
  remark: string | null;
  amount: number | string;
  party_name: string | null;
  vch_type_name: string | null;
  vch_subtype_name: string | null;
  dr_amount: number | string;
  cr_amount: number | string;
  created_at: string;
}

export interface PendingRef {
  billname: string;
  amount: number | string;
  vch_date: string | null;
  vch_no: string | null;
  direction: 'Dr' | 'Cr';
}
