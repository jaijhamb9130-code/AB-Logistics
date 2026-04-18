/**
 * React Navigation param-list types (D-18).
 * Keep param lists here so screens + navigators share a single source of truth.
 */

export type AuthStackParamList = {
  Login: undefined;
};

export type AppTabsParamList = {
  Dashboard: undefined;
  Users: undefined;
};

export type TabName = keyof AppTabsParamList;
