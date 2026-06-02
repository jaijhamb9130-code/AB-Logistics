import { http } from './httpClient';
import type { VchType, DeemedPositive } from '../../../shared/types/voucher';

const BASE = '/api/vch-types';

export const vchTypeService = {
  async list(): Promise<VchType[]> {
    const { data } = await http.get<VchType[]>(BASE);
    return data;
  },
  async create(body: { name: string; parent_id?: number | null; deemed_positive?: DeemedPositive; prefix?: string | null }): Promise<{ id: number }> {
    const { data } = await http.post<{ id: number }>(BASE, body);
    return data;
  },
  async update(id: number, body: { name?: string; parent_id?: number | null; deemed_positive?: DeemedPositive; prefix?: string | null }): Promise<void> {
    await http.put(`${BASE}/${id}`, body);
  },
  // Set/clear ONLY the voucher-number prefix (allowed on system types too).
  // Pass '' or null to clear it.
  async setPrefix(id: number, prefix: string | null): Promise<void> {
    await http.put(`${BASE}/${id}/prefix`, { prefix: prefix ?? '' });
  },
  async remove(id: number): Promise<void> {
    await http.delete(`${BASE}/${id}`);
  },
};
