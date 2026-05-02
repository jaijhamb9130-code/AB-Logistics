// Shared type for vehicle_master table — `name` is the truck registration
// number (plate). UNIQUE in DB so each truck appears once in autocomplete.

export interface VehicleMasterItem {
  id: number;
  name: string;
  vehicle_type: string | null;
  owner_name: string | null;
  owner_mobile: string | null;
  owner_pan: string | null;
  chassis_no: string | null;
  permit_no: string | null;
  validity_date: string | null;
  driver_name: string | null;
  driver_mobile: string | null;
  tally_master_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface VehicleMasterSearchResult {
  id: number;
  name: string;
  vehicle_type: string | null;
  owner_name: string | null;
}

export interface CreateVehicleMasterRequest {
  name: string;
  vehicle_type?: string | null;
  owner_name?: string | null;
  owner_mobile?: string | null;
  owner_pan?: string | null;
  chassis_no?: string | null;
  permit_no?: string | null;
  validity_date?: string | null;
  driver_name?: string | null;
  driver_mobile?: string | null;
}

export type UpdateVehicleMasterRequest = CreateVehicleMasterRequest;
