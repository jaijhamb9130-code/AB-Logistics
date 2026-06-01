import { http } from './httpClient';
import type {
  CreateVoucherRequest,
  VoucherDetail,
  VoucherListResponse,
  DaybookEntry,
  PendingRef,
  OtherLedger,
} from '../../../shared/types/voucher';

const BASE = '/api/vouchers';

export interface VoucherListParams {
  page?: number;
  limit?: number;
  vch_type?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
}

export const voucherService = {
  async list(params: VoucherListParams = {}): Promise<VoucherListResponse> {
    const { data } = await http.get<VoucherListResponse>(BASE, { params });
    return data;
  },

  async get(id: number): Promise<VoucherDetail> {
    const { data } = await http.get<VoucherDetail>(`${BASE}/${id}`);
    return data;
  },

  async create(body: CreateVoucherRequest): Promise<{ id: number }> {
    const { data } = await http.post<{ id: number }>(BASE, body);
    return data;
  },

  async update(id: number, body: CreateVoucherRequest): Promise<void> {
    await http.put(`${BASE}/${id}`, body);
  },

  async remove(id: number): Promise<void> {
    await http.delete(`${BASE}/${id}`);
  },

  async nextNo(vchTypeId: number): Promise<string> {
    const { data } = await http.get<{ vch_no: string }>(`${BASE}/next-no`, { params: { vch_type_id: vchTypeId } });
    return data.vch_no;
  },

  async pendingRefs(customerId: number): Promise<PendingRef[]> {
    const { data } = await http.get<PendingRef[]>(`${BASE}/pending-refs`, { params: { customer_id: customerId } });
    return data;
  },

  async daybook(fromDate: string, toDate: string): Promise<DaybookEntry[]> {
    const { data } = await http.get<DaybookEntry[]>(`${BASE}/daybook`, { params: { date_from: fromDate, date_to: toDate } });
    return data;
  },

  async otherLedgers(): Promise<OtherLedger[]> {
    const { data } = await http.get<OtherLedger[]>(`${BASE}/other-ledgers`);
    return data;
  },

  async ledgerSearch(q: string): Promise<OtherLedger[]> {
    const { data } = await http.get<OtherLedger[]>(`${BASE}/ledger-search`, { params: { q } });
    return data;
  },
};
