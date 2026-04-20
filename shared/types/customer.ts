export interface CustomerListItem {
  id: number;
  customer_no: string;
  name: string;
  phone_number: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
}

export interface CustomerDetail extends CustomerListItem {
  created_at: string;
}

export interface CustomerSearchResult {
  id: number;
  customer_no: string;
  name: string;
  city: string | null;
}

export interface CreateCustomerRequest {
  name: string;
  phone_number?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}

export interface CreateCustomerResponse {
  id: number;
  customer_no: string;
}
