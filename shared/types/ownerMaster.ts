export interface OwnerMasterItem {
  id: number;
  name: string;
  mobile: string | null;
  gst_no: string | null;
  pan_no: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  created_at: string;
  updated_at?: string;
}

export interface CreateOwnerRequest {
  name: string;
  mobile?: string | null;
  gst_no?: string | null;
  pan_no?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}

export type UpdateOwnerRequest = CreateOwnerRequest;
