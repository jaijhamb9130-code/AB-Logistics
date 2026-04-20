/**
 * Phase 5 — typed wrapper around /api/vehicles/*.
 * Piggybacks on the shared http client — Bearer attach + refresh are already
 * wired by AuthProvider.
 */

import { http } from './httpClient';
import type {
  CreateVehicleRequest,
  UpdateVehicleRequest,
  Vehicle,
} from '../../../shared/types/vehicle';

export const vehicleService = {
  async list(): Promise<Vehicle[]> {
    const { data } = await http.get<Vehicle[]>('/api/vehicles');
    return data;
  },

  async get(id: number): Promise<Vehicle> {
    const { data } = await http.get<Vehicle>(`/api/vehicles/${id}`);
    return data;
  },

  async create(body: CreateVehicleRequest): Promise<Vehicle> {
    const { data } = await http.post<Vehicle>('/api/vehicles', body);
    return data;
  },

  async update(id: number, body: UpdateVehicleRequest): Promise<Vehicle> {
    const { data } = await http.patch<Vehicle>(`/api/vehicles/${id}`, body);
    return data;
  },

  async deactivate(id: number): Promise<Vehicle> {
    const { data } = await http.post<Vehicle>(`/api/vehicles/${id}/deactivate`);
    return data;
  },

  async activate(id: number): Promise<Vehicle> {
    const { data } = await http.post<Vehicle>(`/api/vehicles/${id}/activate`);
    return data;
  },
};
