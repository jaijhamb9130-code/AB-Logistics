/**
 * Shared bilty types (Phase 3). Mirrored by backend biltyModel + controller.
 * Numeric columns ship as strings from mysql2 — the UI coerces on render.
 */

export type Numeric = number | string;

export interface BiltyHeader {
  bilty_no: string;
  bilty_date?: string | null;
  consignor: string;
  bill_to?: string | null;
  owner_name?: string | null;
  agent_name?: string | null;
  branch?: string | null;
  zone_name?: string | null;
  truck_no: string;
  goods_type?: string | null;
  truck_type?: string | null;
}

export interface BiltyItem {
  id?: number;
  bilty_id?: number;
  challan_no?: string | null;
  lr_no?: string | null;
  from_loc?: string | null;
  to_loc?: string | null;
  consignee?: string | null;
  qty: Numeric;
  rate: Numeric;
  inc_rate?: Numeric;
  l_rate?: Numeric;
  e_rate?: Numeric;
  // Optional logistics tracking field.
  shipment_no?: string | null;
}

/** Row shape returned by GET /api/bilty. */
export interface BiltyListItem {
  id: number;
  bilty_no: string;
  bilty_date: string | null;
  consignor: string;
  truck_no: string;
  item_count: Numeric;
  created_at: string;
  created_by_username: string | null;
}

/** Full bilty returned by GET /api/bilty/:id. */
export interface BiltyDetail extends BiltyHeader {
  id: number;
  bilty_no: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  items: BiltyItem[];
}

/** Request body sent to POST /api/bilty. */
export interface CreateBiltyRequest {
  header: BiltyHeader;
  items: BiltyItem[];
}

/** Response body returned by POST /api/bilty (server-generated bilty_no). */
export interface CreateBiltyResponse {
  id: number;
  bilty_no: string;
}
