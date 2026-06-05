// Shared types for vehicle_master — the central truck + owner master.
// `name` is aliased to vehicle_no (the registration number) so existing
// consumers (e.g. the bilty truck dropdown) keep working. Owner details live
// on the vehicle record; "Create" keeps owner history (is_current marks live).

export interface VehicleMasterItem {
  id: number;
  name: string;            // = vehicle_no (registration number)
  vehicle_no: string;
  vehicle_type: string | null;
  ledger_group_id: number | null;
  ledger_group: string | null;   // ledger group name
  ledger_master_id: number | null;
  ledger_id: number | null;       // accounting ledger (alias of ledger_master_id)
  owner_name: string | null;
  mobile: string | null;
  gst_no: string | null;
  pan_no: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  is_current: number;
  created_at: string;
  updated_at: string;
}

export interface VehicleMasterSearchResult {
  id: number;
  name: string;
  vehicle_no: string;
  vehicle_type: string | null;
  owner_name: string | null;
}

export interface CreateVehicleMasterRequest {
  name: string;                 // vehicle number (registration)
  vehicle_no?: string;
  vehicle_type?: string | null;
  ledger_group?: string | null; // ledger group name
  owner_name?: string | null;
  mobile?: string | null;
  gst_no?: string | null;
  pan_no?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}

export interface UpdateVehicleMasterRequest extends CreateVehicleMasterRequest {
  /** 'maintain' = edit current version in place; 'create' = new owner-version. */
  mode?: 'maintain' | 'create';
}
