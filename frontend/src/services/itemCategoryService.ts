import { http } from './httpClient';
import type {
  CreateItemCategoryRequest,
  ItemCategoryItem,
  UpdateItemCategoryRequest,
} from '../../../shared/types/itemCategory';

const BASE = '/api/item-categories';

export const itemCategoryService = {
  async list(): Promise<ItemCategoryItem[]> {
    const { data } = await http.get<ItemCategoryItem[]>(BASE);
    return data;
  },

  async search(q: string): Promise<ItemCategoryItem[]> {
    const { data } = await http.get<ItemCategoryItem[]>(`${BASE}/search`, { params: { q } });
    return data;
  },

  async get(id: number): Promise<ItemCategoryItem> {
    const { data } = await http.get<ItemCategoryItem>(`${BASE}/${id}`);
    return data;
  },

  async create(body: CreateItemCategoryRequest): Promise<{ id: number }> {
    const { data } = await http.post<{ id: number }>(BASE, body);
    return data;
  },

  async update(id: number, body: UpdateItemCategoryRequest): Promise<void> {
    await http.put(`${BASE}/${id}`, body);
  },

  async remove(id: number): Promise<void> {
    await http.delete(`${BASE}/${id}`);
  },
};
