/**
 * Pure validators for the Vehicle form (Phase 5). Mirrors backend
 * vehiclesController so the UI can give instant inline feedback, but
 * the server (VEHICLE_NO_RE) is authoritative.
 */

const VEHICLE_NO_RE = /^[a-zA-Z0-9\-\s.]{2,64}$/;

export type VehicleFieldError = 'required' | 'invalid_format';

export function validateVehicleNo(v: string): VehicleFieldError | null {
  if (!v || !v.trim()) return 'required';
  if (!VEHICLE_NO_RE.test(v.trim())) return 'invalid_format';
  return null;
}

export interface VehicleErrors {
  vehicle_no?: VehicleFieldError;
}

export interface VehicleFormInput {
  vehicle_no: string;
  vehicle_type?: string;
  owner_name?: string;
}

export function validateVehicle(input: VehicleFormInput): VehicleErrors {
  const errs: VehicleErrors = {};
  const v = validateVehicleNo(input.vehicle_no);
  if (v) errs.vehicle_no = v;
  return errs;
}
