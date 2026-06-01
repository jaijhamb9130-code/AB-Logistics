import { http } from './httpClient';
import type {
  CreateLedgerMasterRequest,
  LedgerMasterItem,
  LedgerMasterSearchResult,
  LedgerMasterType,
  UpdateLedgerMasterRequest,
} from '../../../shared/types/ledgerMaster';

const BASE = '/api/ledger-master';

export const ledgerMasterService = {
  async list(
    type?: number | string | null,
    opts?: { excludeTypes?: Array<number | string> },
  ): Promise<LedgerMasterItem[]> {
    const params: Record<string, string | number> = {};
    if (type != null) {
      params.type = type;
    } else if (opts?.excludeTypes && opts.excludeTypes.length > 0) {
      params.exclude = opts.excludeTypes.join(',');
    }
    const { data } = await http.get<LedgerMasterItem[]>(BASE, { params });
    return data;
  },

  // `type` is optional — pass undefined to search across ALL ledger groups
  // (used by the Voucher form's Ledger Name autocomplete).
  async search(
    type: number | string | undefined,
    q: string,
  ): Promise<LedgerMasterSearchResult[]> {
    const params: Record<string, string | number> = { q };
    if (type !== undefined && type !== null && type !== '') params.type = type;
    const { data } = await http.get<LedgerMasterSearchResult[]>(`${BASE}/search`, { params });
    return data;
  },


  async get(id: number): Promise<LedgerMasterItem> {
    const { data } = await http.get<LedgerMasterItem>(`${BASE}/${id}`);
    return data;
  },

  async create(body: CreateLedgerMasterRequest): Promise<{ id: number }> {
    const { data } = await http.post<{ id: number }>(BASE, body);
    return data;
  },

  async update(id: number, body: UpdateLedgerMasterRequest): Promise<void> {
    await http.put(`${BASE}/${id}`, body);
  },

  // Admin-only on the backend; the UI hides the delete action for non-admins.
  // Backend returns 409 { error: 'in_use' } if any voucher / bilty references
  // the ledger.
  async delete(id: number): Promise<void> {
    await http.delete(`${BASE}/${id}`);
  },
};
