/**
 * Shared freight-memo types (Phase 4). Mirrored by backend freightModel +
 * controller. Numeric columns ship as strings from mysql2 — the UI coerces on
 * render. The memo itself is READ-ONLY in the UI (FREIGHT-04).
 */

import type {
  AdvanceDetail,
  BiltyDetail,
  BiltyItem,
  FuelDetail,
  Numeric,
} from './bilty';

/** Base totals computed from bilty — same shape in list, detail, create. */
export interface FreightTotals {
  freight_total: Numeric;
  advance_total: Numeric;
  fuel_total: Numeric;
  net_payable: Numeric;
}

/** Row shape returned by GET /api/freight. */
export interface FreightMemoListItem extends FreightTotals {
  id: number;
  memo_no: string;
  bilty_id: number;
  memo_date: string | null;
  generated_by: number | null;
  created_at: string;
  // Joined from bilty for list display.
  bilty_no: string;
  consignor: string;
  truck_no: string;
}

/**
 * Full freight memo + the LIVE bilty snapshot returned by GET /api/freight/:id.
 * Snapshot is computed from the current `bilty` row each request — the memo
 * stores totals only per CLAUDE.md "never duplicate item data here".
 */
export interface FreightMemoDetail extends FreightTotals {
  id: number;
  memo_no: string;
  bilty_id: number;
  memo_date: string | null;
  generated_by: number | null;
  created_at: string;
  updated_at: string;
  bilty: BiltyDetail | null;
}

/** Response body for POST /api/freight/generate. */
export interface GenerateFreightResponse extends FreightTotals {
  id: number;
  memo_no: string;
  bilty_id: number;
  memo_date: string;
}

/** Request body for POST /api/freight/generate. */
export interface GenerateFreightRequest {
  bilty_id: number;
}

/** Minimal memo row returned by /by-bilty/:biltyId (no snapshot). */
export interface FreightMemoByBilty extends FreightTotals {
  id: number;
  memo_no: string;
  bilty_id: number;
  memo_date: string | null;
  generated_by: number | null;
  created_at: string;
  updated_at: string;
}

// Re-export the bilty child shapes so the detail screen has one import surface.
export type { AdvanceDetail, BiltyDetail, BiltyItem, FuelDetail };
