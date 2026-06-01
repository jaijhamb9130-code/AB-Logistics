// Shared type for item_master table — goods type with HSN code + GST rate.
// `tally_master_id` stores Tally's external item ID for sync.
// `item_group_id` / `item_category_id` link to the hierarchical masters
// (item_group / item_category). The `*_name` fields are joined values from
// those tables, included on every row read for display convenience.

export interface ItemMasterItem {
  id: number;
  name: string;
  hsn_code: string | null;
  gst_rate: number | null;
  item_group_id: number | null;
  item_group_name: string | null;
  item_category_id: number | null;
  item_category_name: string | null;
  tally_master_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ItemMasterSearchResult {
  id: number;
  name: string;
  hsn_code: string | null;
  gst_rate: number | null;
}

export interface CreateItemMasterRequest {
  name: string;
  hsn_code?: string | null;
  gst_rate?: number | null;
  item_group_id?: number | null;
  item_category_id?: number | null;
}

export type UpdateItemMasterRequest = CreateItemMasterRequest;
