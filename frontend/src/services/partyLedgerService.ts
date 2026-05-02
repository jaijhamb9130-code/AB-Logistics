import { http } from './httpClient';
import type {
  CreatePartyLedgerRequest,
  PartyLedgerItem,
  PartyLedgerSearchResult,
  PartyLedgerType,
  UpdatePartyLedgerRequest,
} from '../../../shared/types/partyLedger';

const BASE = '/api/party-ledger';

export const partyLedgerService = {
  async list(type: number | string): Promise<PartyLedgerItem[]> {
    const { data } = await http.get<PartyLedgerItem[]>(BASE, { params: { type } });
    return data;
  },

  async search(type: number | string, q: string): Promise<PartyLedgerSearchResult[]> {
    const { data } = await http.get<PartyLedgerSearchResult[]>(`${BASE}/search`, {
      params: { type, q },
    });
    return data;
  },


  async get(id: number): Promise<PartyLedgerItem> {
    const { data } = await http.get<PartyLedgerItem>(`${BASE}/${id}`);
    return data;
  },

  async create(body: CreatePartyLedgerRequest): Promise<{ id: number }> {
    const { data } = await http.post<{ id: number }>(BASE, body);
    return data;
  },

  async update(id: number, body: UpdatePartyLedgerRequest): Promise<void> {
    await http.put(`${BASE}/${id}`, body);
  },

  async sync(): Promise<{ ok?: boolean }> {
    const { data } = await http.post<{ ok?: boolean }>(`${BASE}/sync`);
    return data;
  },
};
