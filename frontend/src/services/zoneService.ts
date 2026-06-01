import { http } from './httpClient';
import type {
  CreateZoneRequest,
  UpdateZoneRequest,
  ZoneMasterItem,
} from '../../../shared/types/zoneMaster';

const BASE = '/api/zones';

export const zoneService = {
  async list(): Promise<ZoneMasterItem[]> {
    const { data } = await http.get<ZoneMasterItem[]>(BASE);
    return data;
  },

  async search(q: string): Promise<ZoneMasterItem[]> {
    const { data } = await http.get<ZoneMasterItem[]>(`${BASE}/search`, { params: { q } });
    return data;
  },

  async get(id: number): Promise<ZoneMasterItem> {
    const { data } = await http.get<ZoneMasterItem>(`${BASE}/${id}`);
    return data;
  },

  async create(body: CreateZoneRequest): Promise<{ id: number }> {
    const { data } = await http.post<{ id: number }>(BASE, body);
    return data;
  },

  async update(id: number, body: UpdateZoneRequest): Promise<void> {
    await http.put(`${BASE}/${id}`, body);
  },

  async remove(id: number): Promise<void> {
    await http.delete(`${BASE}/${id}`);
  },
};
