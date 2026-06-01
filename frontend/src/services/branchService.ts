import { http } from './httpClient';
import type {
  CreateBranchRequest,
  UpdateBranchRequest,
  BranchMasterItem,
} from '../../../shared/types/branchMaster';

const BASE = '/api/branches';

export const branchService = {
  async list(): Promise<BranchMasterItem[]> {
    const { data } = await http.get<BranchMasterItem[]>(BASE);
    return data;
  },
  async search(q: string): Promise<BranchMasterItem[]> {
    const { data } = await http.get<BranchMasterItem[]>(`${BASE}/search`, { params: { q } });
    return data;
  },
  async get(id: number): Promise<BranchMasterItem> {
    const { data } = await http.get<BranchMasterItem>(`${BASE}/${id}`);
    return data;
  },
  async create(body: CreateBranchRequest): Promise<{ id: number }> {
    const { data } = await http.post<{ id: number }>(BASE, body);
    return data;
  },
  async update(id: number, body: UpdateBranchRequest): Promise<void> {
    await http.put(`${BASE}/${id}`, body);
  },
  async remove(id: number): Promise<void> {
    await http.delete(`${BASE}/${id}`);
  },
};
