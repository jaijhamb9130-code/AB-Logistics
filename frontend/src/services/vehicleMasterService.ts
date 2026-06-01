import { http } from './httpClient';
import type {
  CreateVehicleMasterRequest,
  UpdateVehicleMasterRequest,
  VehicleMasterItem,
  VehicleMasterSearchResult,
} from '../../../shared/types/vehicleMaster';

const BASE = '/api/vehicle-master';

export const vehicleMasterService = {
  async list(): Promise<VehicleMasterItem[]> {
    const { data } = await http.get<VehicleMasterItem[]>(BASE);
    return data;
  },

  async search(q: string): Promise<VehicleMasterSearchResult[]> {
    const { data } = await http.get<VehicleMasterSearchResult[]>(`${BASE}/search`, { params: { q } });
    return data;
  },

  async get(id: number): Promise<VehicleMasterItem> {
    const { data } = await http.get<VehicleMasterItem>(`${BASE}/${id}`);
    return data;
  },

  async create(body: CreateVehicleMasterRequest): Promise<{ id: number }> {
    const { data } = await http.post<{ id: number }>(BASE, body);
    return data;
  },

  async update(id: number, body: UpdateVehicleMasterRequest): Promise<void> {
    await http.put(`${BASE}/${id}`, body);
  },

  // Backend returns 204 on success; 409 { error: 'in_use' } when a downstream
  // record references the vehicle.
  async delete(id: number): Promise<void> {
    await http.delete(`${BASE}/${id}`);
  },
};
