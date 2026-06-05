/**
 * React Navigation param-list types (D-18).
 * Keep param lists here so screens + navigators share a single source of truth.
 */

export type AuthStackParamList = {
  Login: undefined;
};

export type AppTabsParamList = {
  Dashboard: undefined;
  Bilty: undefined;
  Freight: undefined;
  Billing: undefined;
  LedgerMaster: undefined;
  // Children of the Ledger Master parent in the nav dropdown.
  // Customers is scoped to the Sundry Debtors group; OtherLedgers shows all.
  Customers: undefined;
  OtherLedgers: undefined;
  AgentMaster: undefined;
  ItemMaster: undefined;
  ItemGroup: undefined;
  ItemCategory: undefined;
  VehicleMaster: undefined;
  DestinationMaster: undefined;
  BranchMaster: undefined;
  // Top-level Ledger Groups admin tab — second-last (just before Users).
  LedgerGroups: undefined;
  // Voucher Type master — lives in the Masters dropdown.
  VoucherType: undefined;
  Users: undefined;
};

export type TabName = keyof AppTabsParamList;

/**
 * Bilty stack (Phase 3) — nested inside the Bilty tab.
 * BiltyForm/BiltyDetail route through the same stack so navigation.replace()
 * works after save.
 */
export type BiltyStackParamList = {
  BiltyList: undefined;
  // `id` is the DB primary key; `bilty_no` (e.g. "18520") is the
  // user-meaningful number that drives the URL — /edit/bilty/:bilty_no.
  // The form loads by id when present, otherwise resolves bilty_no → id
  // via /api/bilty/by-no/:no.
  // `returnTo: 'daybook'` makes save/cancel return to the Billing → Daybook
  // screen (used when the form is opened from a Day Book row), instead of the
  // default BiltyList / dashboard landing.
  BiltyForm: { id?: number; bilty_no?: string; returnTo?: 'daybook' } | undefined;
  BiltyDetail: { id: number };
};

/**
 * Freight stack (Phase 4) — nested inside the Freight tab.
 * FreightList shows all memos; FreightDetail renders the read-only A4 ledger.
 */
export type FreightStackParamList = {
  FreightList: undefined;
  FreightDetail: { id: number };
};

/**
 * Billing stack — Tally-style vouchers (Phase 7).
 * VouchersList → VoucherForm (create or edit) → Daybook (day view).
 */
export type BillingStackParamList = {
  VouchersList: undefined;
  // `id` edits a generic voucher; `biltyEditId` edits a Bilty in-place on the
  // Vouchers page (Bilty vch type), used when a Bilty / Freight Journal row is
  // edited from the Day Book.
  VoucherForm: { id?: number; biltyEditId?: number; editVoucher?: { id: number } } | undefined;
  // `notice` shows a one-shot success toast on arrival (e.g. after a voucher
  // update navigates back here).
  Daybook: { date?: string; notice?: string } | undefined;
};
