import { http } from './httpClient';
import type {
  CreateOwnerRequest,
  UpdateOwnerRequest,
  OwnerMasterItem,
} from '../../../shared/types/ownerMaster';

const BASE = '/api/owners';

export const ownerService = {
  async list(): Promise<OwnerMasterItem[]> {
    const { data } = await http.get<OwnerMasterItem[]>(BASE);
    return data;
  },
  async search(q: string): Promise<OwnerMasterItem[]> {
    const { data } = await http.get<OwnerMasterItem[]>(`${BASE}/search`, { params: { q } });
    return data;
  },
  async get(id: number): Promise<OwnerMasterItem> {
    const { data } = await http.get<OwnerMasterItem>(`${BASE}/${id}`);
    return data;
  },
  async create(body: CreateOwnerRequest): Promise<{ id: number }> {
    const { data } = await http.post<{ id: number }>(BASE, body);
    return data;
  },
  async update(id: number, body: UpdateOwnerRequest): Promise<void> {
    await http.put(`${BASE}/${id}`, body);
  },
  async remove(id: number): Promise<void> {
    await http.delete(`${BASE}/${id}`);
  },
};
