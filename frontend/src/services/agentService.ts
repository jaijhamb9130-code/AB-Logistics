import { http } from './httpClient';
import type {
  CreateAgentRequest,
  UpdateAgentRequest,
  AgentMasterItem,
} from '../../../shared/types/agentMaster';

const BASE = '/api/agents';

export const agentService = {
  async list(): Promise<AgentMasterItem[]> {
    const { data } = await http.get<AgentMasterItem[]>(BASE);
    return data;
  },
  async search(q: string): Promise<AgentMasterItem[]> {
    const { data } = await http.get<AgentMasterItem[]>(`${BASE}/search`, { params: { q } });
    return data;
  },
  async get(id: number): Promise<AgentMasterItem> {
    const { data } = await http.get<AgentMasterItem>(`${BASE}/${id}`);
    return data;
  },
  async create(body: CreateAgentRequest): Promise<{ id: number }> {
    const { data } = await http.post<{ id: number }>(BASE, body);
    return data;
  },
  async update(id: number, body: UpdateAgentRequest): Promise<void> {
    await http.put(`${BASE}/${id}`, body);
  },
  async remove(id: number): Promise<void> {
    await http.delete(`${BASE}/${id}`);
  },
};
