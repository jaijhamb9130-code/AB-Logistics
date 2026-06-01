import { http } from './httpClient';
import type {
  CreateDestinationRequest,
  DestinationLocationSearchResult,
  DestinationMasterItem,
  UpdateDestinationRequest,
} from '../../../shared/types/destinationMaster';

const BASE = '/api/destinations';

export const destinationService = {
  async list(branch?: string): Promise<DestinationMasterItem[]> {
    const { data } = await http.get<DestinationMasterItem[]>(BASE, {
      params: branch ? { branch } : undefined,
    });
    return data;
  },

  async get(id: number): Promise<DestinationMasterItem> {
    const { data } = await http.get<DestinationMasterItem>(`${BASE}/${id}`);
    return data;
  },

  async create(body: CreateDestinationRequest): Promise<{ id: number }> {
    const { data } = await http.post<{ id: number }>(BASE, body);
    return data;
  },

  async update(id: number, body: UpdateDestinationRequest): Promise<void> {
    await http.put(`${BASE}/${id}`, body);
  },

  // Backend returns 204 on success; 409 { error: 'in_use' } when a downstream
  // record references the destination.
  async delete(id: number): Promise<void> {
    await http.delete(`${BASE}/${id}`);
  },

  // Distinct branch names — feeds Bilty Branch dropdown.
  async listBranches(): Promise<string[]> {
    const { data } = await http.get<string[]>(`${BASE}/branches`);
    return data;
  },

  async searchBranches(q: string): Promise<string[]> {
    const { data } = await http.get<string[]>(`${BASE}/branches/search`, { params: { q } });
    return data;
  },

  // From/To autocomplete — filtered to branch when given.
  async searchLocations(q: string, branch?: string): Promise<DestinationLocationSearchResult[]> {
    const { data } = await http.get<DestinationLocationSearchResult[]>(`${BASE}/search`, {
      params: branch ? { q, branch } : { q },
    });
    return data;
  },

  async sync(): Promise<{ ok?: boolean }> {
    const { data } = await http.post<{ ok?: boolean }>(`${BASE}/sync`);
    return data;
  },
};
