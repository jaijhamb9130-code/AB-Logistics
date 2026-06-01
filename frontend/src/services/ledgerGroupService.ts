import { http } from './httpClient';
import type {
  CreateLedgerGroupRequest,
  LedgerGroupItem,
  UpdateLedgerGroupRequest,
} from '../../../shared/types/ledgerGroup';

const BASE = '/api/ledger-groups';

export const ledgerGroupService = {
  async list(): Promise<LedgerGroupItem[]> {
    const { data } = await http.get<LedgerGroupItem[]>(BASE);
    return data;
  },

  async search(q: string): Promise<LedgerGroupItem[]> {
    const { data } = await http.get<LedgerGroupItem[]>(`${BASE}/search`, { params: { q } });
    return data;
  },

  async get(id: number): Promise<LedgerGroupItem> {
    const { data } = await http.get<LedgerGroupItem>(`${BASE}/${id}`);
    return data;
  },

  async create(body: CreateLedgerGroupRequest): Promise<{ id: number }> {
    const { data } = await http.post<{ id: number }>(BASE, body);
    return data;
  },

  async update(id: number, body: UpdateLedgerGroupRequest): Promise<void> {
    await http.put(`${BASE}/${id}`, body);
  },

  async remove(id: number): Promise<void> {
    await http.delete(`${BASE}/${id}`);
  },
};
