// Shared type for item_master table — goods type with HSN code + GST rate.
// `tally_master_id` stores Tally's external item ID for sync.

export interface ItemMasterItem {
  id: number;
  name: string;
  hsn_code: string | null;
  gst_rate: number | null;
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
}

export type UpdateItemMasterRequest = CreateItemMasterRequest;
