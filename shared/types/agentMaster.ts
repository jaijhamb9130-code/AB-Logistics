export interface AgentMasterItem {
  id: number;
  name: string;
  mobile: string | null;
  gst_no: string | null;
  pan_no: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  commission_pct: number;
  created_at: string;
  updated_at?: string;
}

export interface CreateAgentRequest {
  name: string;
  mobile?: string | null;
  gst_no?: string | null;
  pan_no?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  commission_pct?: number;
}

export type UpdateAgentRequest = CreateAgentRequest;
