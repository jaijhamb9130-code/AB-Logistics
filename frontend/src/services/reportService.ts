/**
 * Typed wrapper around /api/reports/*.
 *
 * The Reports page was retired. The summary endpoint is still used to
 * power dashboard tile counts (Bilty / Freight / Ledger Groups / Active
 * users) — see DashboardScreen + ProfilePanel.
 */

import { http } from './httpClient';
import type { ReportSummary } from '../../../shared/types/report';

export const reportService = {
  async getSummary(): Promise<ReportSummary> {
    const { data } = await http.get<ReportSummary>('/api/reports/summary');
    return data;
  },
};
