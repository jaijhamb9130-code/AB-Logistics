import { http } from './httpClient';
import type { ReportSummary } from '../../../shared/types/report';

function toQuery(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') p.append(k, String(v));
  }
  return p.toString();
}

export const reportService = {
  async getSummary(): Promise<ReportSummary> {
    const { data } = await http.get<ReportSummary>('/api/reports/summary');
    return data;
  },

  async getBiltyRegister(params: { from: string; to: string; branch?: string; truck?: string; consignor?: string }) {
    const { data } = await http.get<{ success: boolean; data: any[] }>(`/api/reports/bilty-register?${toQuery(params)}`);
    return data.data;
  },

  async getVoucherRegister(params: { from: string; to: string; vch_type_id?: string; search?: string }) {
    const { data } = await http.get<{ success: boolean; data: any[] }>(`/api/reports/voucher-register?${toQuery(params)}`);
    return data.data;
  },

  async getLedgerStatement(params: { ledger_id: number; from: string; to: string }) {
    const { data } = await http.get<{ success: boolean; data: any }>(`/api/reports/ledger-statement?${toQuery(params)}`);
    return data.data;
  },

  async getGroupSummary(params: { from: string; to: string }) {
    const { data } = await http.get<{ success: boolean; data: any[] }>(`/api/reports/group-summary?${toQuery(params)}`);
    return data.data;
  },

  async getGroupLedgers(params: { group_id: number; from: string; to: string }) {
    const { data } = await http.get<{ success: boolean; data: any[]; group_name: string }>(`/api/reports/group-ledgers?${toQuery(params)}`);
    return data;
  },
};
