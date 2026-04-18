/**
 * Phase 6 — typed wrapper around /api/reports/*.
 */

import { http } from './httpClient';
import type { ReportSummary, ReportHistory } from '../../../shared/types/report';

export const reportService = {
  async getSummary(): Promise<ReportSummary> {
    const { data } = await http.get<ReportSummary>('/api/reports/summary');
    return data;
  },

  async getHistory(): Promise<ReportHistory> {
    const { data } = await http.get<ReportHistory>('/api/reports/history');
    return data;
  },
};
