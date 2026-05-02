import { http } from './httpClient';
import type {
  CreateItemMasterRequest,
  ItemMasterItem,
  ItemMasterSearchResult,
  UpdateItemMasterRequest,
} from '../../../shared/types/itemMaster';

const BASE = '/api/item-master';

export const itemMasterService = {
  async list(): Promise<ItemMasterItem[]> {
    const { data } = await http.get<ItemMasterItem[]>(BASE);
    return data;
  },

  async search(q: string): Promise<ItemMasterSearchResult[]> {
    const { data } = await http.get<ItemMasterSearchResult[]>(`${BASE}/search`, { params: { q } });
    return data;
  },

  async get(id: number): Promise<ItemMasterItem> {
    const { data } = await http.get<ItemMasterItem>(`${BASE}/${id}`);
    return data;
  },

  async create(body: CreateItemMasterRequest): Promise<{ id: number }> {
    const { data } = await http.post<{ id: number }>(BASE, body);
    return data;
  },

  async update(id: number, body: UpdateItemMasterRequest): Promise<void> {
    await http.put(`${BASE}/${id}`, body);
  },

  async sync(): Promise<{ ok?: boolean }> {
    const { data } = await http.post<{ ok?: boolean }>(`${BASE}/sync`);
    return data;
  },
};
