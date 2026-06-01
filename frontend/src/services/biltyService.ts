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

  // Resolve a bilty_no to its primary key. Used by the URL router so a path
  // like /edit/bilty/18520 can fetch the underlying record.
  async idByNo(no: string): Promise<number | null> {
    try {
      const { data } = await http.get<{ id: number }>(`/api/bilty/by-no/${encodeURIComponent(no)}`);
      return data?.id ?? null;
    } catch {
      return null;
    }
  },

  async create(body: CreateBiltyRequest): Promise<CreateBiltyResponse> {
    const { data } = await http.post<CreateBiltyResponse>('/api/bilty', body);
    return data;
  },

  async update(id: number, body: CreateBiltyRequest): Promise<BiltyDetail> {
    const { data } = await http.patch<BiltyDetail>(`/api/bilty/${id}`, body);
    return data;
  },

  // Backend returns 204 on success; 409 { error: 'in_use' } when a freight
  // memo (or other downstream voucher row) still references this bilty.
  async delete(id: number): Promise<void> {
    await http.delete(`/api/bilty/${id}`);
  },

  // Auto-suggest next bilty number, optionally per-branch.
  async nextNo(branch?: string): Promise<string> {
    const { data } = await http.get<{ next: string }>('/api/bilty/next-no', {
      params: branch ? { branch } : undefined,
    });
    return data.next;
  },
};
