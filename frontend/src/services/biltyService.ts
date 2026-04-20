/**
 * Phase 3 — typed wrapper around /api/bilty/*.
 * Piggybacks on the shared http client — Bearer attach + refresh are already
 * wired by AuthProvider.
 */

import { http } from './httpClient';
import type {
  BiltyDetail,
  BiltyListItem,
  CreateBiltyRequest,
  CreateBiltyResponse,
} from '../../../shared/types/bilty';

export const biltyService = {
  async list(): Promise<BiltyListItem[]> {
    const { data } = await http.get<BiltyListItem[]>('/api/bilty');
    return data;
  },

  async get(id: number): Promise<BiltyDetail> {
    const { data } = await http.get<BiltyDetail>(`/api/bilty/${id}`);
    return data;
  },

  async create(body: CreateBiltyRequest): Promise<CreateBiltyResponse> {
    const { data } = await http.post<CreateBiltyResponse>('/api/bilty', body);
    return data;
  },

  async update(id: number, body: CreateBiltyRequest): Promise<BiltyDetail> {
    const { data } = await http.patch<BiltyDetail>(`/api/bilty/${id}`, body);
    return data;
  },
};
