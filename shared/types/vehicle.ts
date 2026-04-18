/**
 * Shared vehicle types (Phase 5). Mirrored by backend vehicleModel + controller.
 */

export interface Vehicle {
  id: number;
  vehicle_no: string;
  vehicle_type: string | null;
  owner_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface CreateVehicleRequest {
  vehicle_no: string;
  vehicle_type?: string | null;
  owner_name?: string | null;
}

export interface UpdateVehicleRequest {
  vehicle_no?: string;
  vehicle_type?: string | null;
  owner_name?: string | null;
}
