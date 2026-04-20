import React from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DashboardScreen } from '../screens/DashboardScreen';
import { UsersScreen } from '../screens/UsersScreen';
import { BiltyStack } from './BiltyStack';
import { FreightStack } from './FreightStack';
import { OrdersStack } from './OrdersStack';
import { VehiclesStack } from './VehiclesStack';
import { CustomersStack } from './CustomersStack';
import { ReportsScreen } from '../screens/ReportsScreen';
import { useAuth } from '../context/AuthContext';
import { canAccessTab } from './guards';
import { colors } from '../constants/theme';
import { TopNavBar, TOP_NAV_HEIGHT } from '../components/TopNavBar';
import type { AppTabsParamList } from './types';

const Tab = createBottomTabNavigator<AppTabsParamList>();

// Wraps a screen so its content always starts below the fixed top nav bar.
// Defined outside AppTabs to keep component identity stable across renders.
function withPad(Screen: React.ComponentType<any>): React.ComponentType<any> {
  return function PaddedScreen(props: any) {
    return (
      <View style={{ flex: 1, paddingTop: TOP_NAV_HEIGHT, backgroundColor: colors.background }}>
        <Screen {...props} />
      </View>
    );
  };
}

const PaddedDashboard = withPad(DashboardScreen);
const PaddedBiltyStack = withPad(BiltyStack);
const PaddedFreightStack = withPad(FreightStack);
const PaddedOrdersStack = withPad(OrdersStack);
const PaddedVehiclesStack = withPad(VehiclesStack);
const PaddedCustomersStack = withPad(CustomersStack);
const PaddedReports = withPad(ReportsScreen);
const PaddedUsers = withPad(UsersScreen);

export function AppTabs() {
  const { user } = useAuth();

  return (
    <Tab.Navigator
      tabBar={(props) => <TopNavBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneContainerStyle: { backgroundColor: colors.background },
      }}
    >
      <Tab.Screen name="Dashboard" component={PaddedDashboard} />
      {canAccessTab('Bilty', user) && (
        <Tab.Screen name="Bilty" component={PaddedBiltyStack} />
      )}
      {canAccessTab('Freight', user) && (
        <Tab.Screen name="Freight" component={PaddedFreightStack} />
      )}
      {canAccessTab('Orders', user) && (
        <Tab.Screen name="Orders" component={PaddedOrdersStack} />
      )}
      {canAccessTab('Vehicles', user) && (
        <Tab.Screen name="Vehicles" component={PaddedVehiclesStack} />
      )}
      {canAccessTab('Customers', user) && (
        <Tab.Screen name="Customers" component={PaddedCustomersStack} />
      )}
      {canAccessTab('Reports', user) && (
        <Tab.Screen name="Reports" component={PaddedReports} />
      )}
      {canAccessTab('Users', user) && (
        <Tab.Screen name="Users" component={PaddedUsers} />
      )}
    </Tab.Navigator>
  );
}
