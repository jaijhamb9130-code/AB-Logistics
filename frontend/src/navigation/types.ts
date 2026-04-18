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
  Orders: undefined;
  Vehicles: undefined;
  Reports: undefined;
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
  BiltyForm: undefined;
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
 * Orders stack (Phase 5) — nested inside the Orders tab.
 * OrderList → OrderDetail. New Order is a modal on OrderList (not a stack route).
 */
export type OrdersStackParamList = {
  OrderList: undefined;
  OrderDetail: { id: number };
};

/**
 * Vehicles stack (Phase 5) — nested inside the Vehicles tab.
 * Single list screen; create/edit/deactivate happen in modals.
 */
export type VehiclesStackParamList = {
  VehicleList: undefined;
};
