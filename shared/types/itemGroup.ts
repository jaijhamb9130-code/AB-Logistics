// Item group — hierarchical master mirroring ledger_group.
// `parent_id = null` ⇒ a top-level "Primary" group.

export interface ItemGroupItem {
  id: number;
  group_name: string;
  parent_id: number | null;
  parent_name: string | null;
  created_at: string;
}

export interface CreateItemGroupRequest {
  group_name: string;
  parent_id?: number | null;
}

export type UpdateItemGroupRequest = CreateItemGroupRequest;
