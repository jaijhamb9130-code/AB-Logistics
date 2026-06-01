import { http } from './httpClient';
import type {
  CreateItemGroupRequest,
  ItemGroupItem,
  UpdateItemGroupRequest,
} from '../../../shared/types/itemGroup';

const BASE = '/api/item-groups';

export const itemGroupService = {
  async list(): Promise<ItemGroupItem[]> {
    const { data } = await http.get<ItemGroupItem[]>(BASE);
    return data;
  },

  async search(q: string): Promise<ItemGroupItem[]> {
    const { data } = await http.get<ItemGroupItem[]>(`${BASE}/search`, { params: { q } });
    return data;
  },

  async get(id: number): Promise<ItemGroupItem> {
    const { data } = await http.get<ItemGroupItem>(`${BASE}/${id}`);
    return data;
  },

  async create(body: CreateItemGroupRequest): Promise<{ id: number }> {
    const { data } = await http.post<{ id: number }>(BASE, body);
    return data;
  },

  async update(id: number, body: UpdateItemGroupRequest): Promise<void> {
    await http.put(`${BASE}/${id}`, body);
  },

  async remove(id: number): Promise<void> {
    await http.delete(`${BASE}/${id}`);
  },
};
