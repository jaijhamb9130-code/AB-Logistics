// Shared type for destination_master — flat single table.
// `branch` is a string column (not a separate table). `branch=null` means a
// standalone destination not under any branch.

export interface DestinationMasterItem {
  id: number;
  branch: string | null;
  name: string;
  city: string | null;
  state: string | null;
  pincode: string | null;
  tally_master_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DestinationLocationSearchResult {
  id: number;
  branch: string | null;
  name: string;
  city: string | null;
  state: string | null;
}

export interface CreateDestinationRequest {
  branch?: string | null;
  name: string;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}

export type UpdateDestinationRequest = CreateDestinationRequest;
