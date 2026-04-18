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
import { Ionicons } from '@expo/vector-icons';
import { DashboardScreen } from '../screens/DashboardScreen';
import { UsersScreen } from '../screens/UsersScreen';
import { BiltyStack } from './BiltyStack';
import { FreightStack } from './FreightStack';
import { OrdersStack } from './OrdersStack';
import { VehiclesStack } from './VehiclesStack';
import { ReportsScreen } from '../screens/ReportsScreen';
import { useAuth } from '../context/AuthContext';
import { canAccessTab } from './guards';
import { colors } from '../constants/theme';
import type { AppTabsParamList } from './types';

const TAB_ICONS: Record<string, { focused: string; unfocused: string }> = {
  Dashboard:  { focused: 'home',            unfocused: 'home-outline' },
  Bilty:      { focused: 'document-text',   unfocused: 'document-text-outline' },
  Freight:    { focused: 'cube',            unfocused: 'cube-outline' },
  Orders:     { focused: 'list',            unfocused: 'list-outline' },
  Vehicles:   { focused: 'car',             unfocused: 'car-outline' },
  Reports:    { focused: 'bar-chart',       unfocused: 'bar-chart-outline' },
  Users:      { focused: 'people',          unfocused: 'people-outline' },
};

const Tab = createBottomTabNavigator<AppTabsParamList>();

export function AppTabs() {
  const { user } = useAuth();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          const icons = TAB_ICONS[route.name] ?? { focused: 'ellipse', unfocused: 'ellipse-outline' };
          return (
            <Ionicons
              name={(focused ? icons.focused : icons.unfocused) as any}
              size={size}
              color={color}
            />
          );
        },
        tabBarActiveTintColor: colors.brandYellow,
        tabBarInactiveTintColor: colors.brandRed,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          shadowColor: colors.brandYellow,
          shadowOpacity: 0.35,
          shadowRadius: 10,
          elevation: 10,
        },
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      {canAccessTab('Bilty', user) && (
        <Tab.Screen
          name="Bilty"
          component={BiltyStack}
          options={{ headerShown: false }}
        />
      )}
      {canAccessTab('Freight', user) && (
        <Tab.Screen
          name="Freight"
          component={FreightStack}
          options={{ headerShown: false }}
        />
      )}
      {canAccessTab('Orders', user) && (
        <Tab.Screen
          name="Orders"
          component={OrdersStack}
          options={{ headerShown: false }}
        />
      )}
      {canAccessTab('Vehicles', user) && (
        <Tab.Screen
          name="Vehicles"
          component={VehiclesStack}
          options={{ headerShown: false }}
        />
      )}
      {canAccessTab('Reports', user) && (
        <Tab.Screen name="Reports" component={ReportsScreen} />
      )}
      {canAccessTab('Users', user) && (
        <Tab.Screen name="Users" component={UsersScreen} />
      )}
    </Tab.Navigator>
  );
}
