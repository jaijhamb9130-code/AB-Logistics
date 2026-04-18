/**
 * Phase 4 — typed wrapper around /api/freight/*.
 * Piggybacks on the shared http client (Bearer + refresh already wired).
 */

import { http } from './httpClient';
import type {
  FreightMemoByBilty,
  FreightMemoDetail,
  FreightMemoListItem,
  GenerateFreightResponse,
} from '../../../shared/types/freight';

export const freightService = {
  async list(): Promise<FreightMemoListItem[]> {
    const { data } = await http.get<FreightMemoListItem[]>('/api/freight');
    return data;
  },

  async get(id: number): Promise<FreightMemoDetail> {
    const { data } = await http.get<FreightMemoDetail>(`/api/freight/${id}`);
    return data;
  },

  async generate(biltyId: number): Promise<GenerateFreightResponse> {
    const { data } = await http.post<GenerateFreightResponse>(
      '/api/freight/generate',
      { bilty_id: biltyId }
    );
    return data;
  },

  async getByBiltyId(biltyId: number): Promise<FreightMemoByBilty> {
    const { data } = await http.get<FreightMemoByBilty>(
      `/api/freight/by-bilty/${biltyId}`
    );
    return data;
  },
};
