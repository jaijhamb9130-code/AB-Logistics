/**
 * Authenticated bottom-tab navigator (AUTH-06, D-18).
 *
 * Tab visibility is gated by `canAccessTab(user)`:
 *  - Dashboard : all roles
 *  - Users     : admin only (hidden from staff)
 *
 * This is the UI gate; the backend's roleMiddleware is the real enforcement.
 */

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DashboardScreen } from '../screens/DashboardScreen';
import { UsersScreen } from '../screens/UsersScreen';
import { useAuth } from '../context/AuthContext';
import { canAccessTab } from './guards';
import { colors } from '../constants/theme';
import type { AppTabsParamList } from './types';

const Tab = createBottomTabNavigator<AppTabsParamList>();

export function AppTabs() {
  const { user } = useAuth();

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
      }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      {canAccessTab('Users', user) && (
        <Tab.Screen name="Users" component={UsersScreen} />
      )}
    </Tab.Navigator>
  );
}
