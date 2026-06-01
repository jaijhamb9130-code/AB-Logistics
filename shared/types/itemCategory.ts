// Item category — hierarchical master mirroring ledger_group.
// `parent_id = null` ⇒ a top-level "Primary" category.

export interface ItemCategoryItem {
  id: number;
  category_name: string;
  parent_id: number | null;
  parent_name: string | null;
  created_at: string;
}

export interface CreateItemCategoryRequest {
  category_name: string;
  parent_id?: number | null;
}

export type UpdateItemCategoryRequest = CreateItemCategoryRequest;
