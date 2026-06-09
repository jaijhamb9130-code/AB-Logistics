export interface RecentBilty {
  id: number;
  bilty_no: string;
  bilty_date: string;
  amount: number;
  consignor: string | null;
  truck_no: string | null;
}

export interface ReportSummary {
  bilties: number;
  today_bilties: number;
  today_freight: number;
  month_bilties: number;
  month_freight: number;
  recent_bilties: RecentBilty[];
  freight_memos: number;
  ledger_groups: number;
  active_users: number;
  permissions: {
    bilty: boolean;
    freight: boolean;
    daybook: boolean;
    ledgergroup: boolean;
    user: boolean;
  };
}
