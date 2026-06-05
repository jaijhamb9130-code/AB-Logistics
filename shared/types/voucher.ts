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
  /** Optional voucher-number prefix; null/empty = plain numbering. */
  prefix: string | null;
  /** Optional branch (name). When set, the bilty form auto-fills + locks Branch. */
  branch?: string | null;
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
  /** Advance/Fuel sub-mode (Contra/Journal/Payment/Receipt only): 1 = advance, 2 = fuel, null/0 = normal. */
  bilty_mode?: number | null;
  /** Bilty selected in Advance/Fuel mode — persisted so the Bilty No can be restored on edit. */
  bilty_id?: number | null;
}

/** Response of GET /api/vouchers/bilty-vehicle-ledger — truck ledger to lock into row 1 (Advance). */
export interface BiltyVehicleLedger {
  ledger_id: number | null;
  ledger_name: string | null;
  truck_no: string | null;
}

/**
 * Response of GET /api/vouchers/bilty-budget — Advance/Fuel spend cap for a bilty.
 * transport_total = Σ(qty × l_rate) over the bilty's line items.
 * used            = Σ(Dr) of existing Advance+Fuel journals on the bilty (shared pool).
 * remaining       = transport_total − used. A new Advance/Fuel journal's Dr total
 *                   may not exceed `remaining` (enforced both client- and server-side).
 */
export interface BiltyBudget {
  transport_total: number;
  used: number;
  remaining: number;
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
  bilty_mode?: number | null;
  /** Bilty selected in Advance/Fuel mode (restores the Bilty No on edit). */
  bilty_id?: number | null;
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
  /** For child vouchers (e.g. Freight Journal) → the source bilty's vch id. */
  parent_vch_id: number | null;
  party_name: string | null;
  vch_type_name: string | null;
  vch_subtype_name: string | null;
  dr_amount: number | string;
  cr_amount: number | string;
  created_at: string;
  /** Last create/update timestamp — drives same-day ordering in the Daybook. */
  updated_at: string;
}

export interface PendingRef {
  billname: string;
  amount: number | string;
  vch_date: string | null;
  vch_no: string | null;
  direction: 'Dr' | 'Cr';
}
