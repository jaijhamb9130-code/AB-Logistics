import React from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DashboardScreen } from '../screens/DashboardScreen';
import { UsersScreen } from '../screens/UsersScreen';
import { BiltyStack } from './BiltyStack';
import { FreightStack } from './FreightStack';
import { BillingStack } from './BillingStack';
import { ReportsScreen } from '../screens/ReportsScreen';
import { PartyMasterScreen } from '../screens/PartyMasterScreen';
import { OwnerMasterScreen } from '../screens/OwnerMasterScreen';
import { AgentMasterScreen } from '../screens/AgentMasterScreen';
import { ItemMasterScreen } from '../screens/ItemMasterScreen';
import { VehicleMasterScreen } from '../screens/VehicleMasterScreen';
import { DestinationMasterScreen } from '../screens/DestinationMasterScreen';
import { LedgerGroupsScreen } from '../screens/LedgerGroupsScreen';
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
const PaddedBillingStack = withPad(BillingStack);
const PaddedPartyMaster = withPad(PartyMasterScreen);
const PaddedOwnerMaster = withPad(OwnerMasterScreen);
const PaddedAgentMaster = withPad(AgentMasterScreen);
const PaddedItemMaster = withPad(ItemMasterScreen);
const PaddedVehicleMaster = withPad(VehicleMasterScreen);
const PaddedDestinationMaster = withPad(DestinationMasterScreen);
const PaddedLedgerGroups = withPad(LedgerGroupsScreen);
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
      {canAccessTab('Dashboard', user) && (
        <Tab.Screen name="Dashboard" component={PaddedDashboard} />
      )}
      {canAccessTab('Bilty', user) && (
        <Tab.Screen name="Bilty" component={PaddedBiltyStack} />
      )}
      {canAccessTab('Freight', user) && (
        <Tab.Screen name="Freight" component={PaddedFreightStack} />
      )}
      {canAccessTab('Billing', user) && (
        <Tab.Screen name="Billing" component={PaddedBillingStack} />
      )}
      {canAccessTab('PartyMaster', user) && (
        <Tab.Screen name="PartyMaster" component={PaddedPartyMaster} />
      )}
      {canAccessTab('OwnerMaster', user) && (
        <Tab.Screen name="OwnerMaster" component={PaddedOwnerMaster} />
      )}
      {canAccessTab('AgentMaster', user) && (
        <Tab.Screen name="AgentMaster" component={PaddedAgentMaster} />
      )}
      {canAccessTab('ItemMaster', user) && (
        <Tab.Screen name="ItemMaster" component={PaddedItemMaster} />
      )}
      {canAccessTab('VehicleMaster', user) && (
        <Tab.Screen name="VehicleMaster" component={PaddedVehicleMaster} />
      )}
      {canAccessTab('DestinationMaster', user) && (
        <Tab.Screen name="DestinationMaster" component={PaddedDestinationMaster} />
      )}
      {canAccessTab('Reports', user) && (
        <Tab.Screen name="Reports" component={PaddedReports} />
      )}
      {canAccessTab('LedgerGroups', user) && (
        <Tab.Screen name="LedgerGroups" component={PaddedLedgerGroups} />
      )}
      {canAccessTab('Users', user) && (
        <Tab.Screen name="Users" component={PaddedUsers} />
      )}
    </Tab.Navigator>
  );
}
