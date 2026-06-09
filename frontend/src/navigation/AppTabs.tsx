import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DashboardScreen } from '../screens/DashboardScreen';
import { UsersScreen } from '../screens/UsersScreen';
import { BiltyStack } from './BiltyStack';
import { BillingStack } from './BillingStack';
import { ReportsStack } from './ReportsStack';
import { LedgerMasterScreen } from '../screens/LedgerMasterScreen';
import { CustomersMasterScreen } from '../screens/CustomersMasterScreen';
import { OtherLedgersScreen } from '../screens/OtherLedgersScreen';
import { AgentMasterScreen } from '../screens/AgentMasterScreen';
import { ItemMasterScreen } from '../screens/ItemMasterScreen';
import { ItemGroupScreen } from '../screens/ItemGroupScreen';
import { ItemCategoryScreen } from '../screens/ItemCategoryScreen';
import { VehicleMasterScreen } from '../screens/VehicleMasterScreen';
import { DestinationMasterScreen } from '../screens/DestinationMasterScreen';
import { BranchMasterScreen } from '../screens/BranchMasterScreen';
import { LedgerGroupsScreen } from '../screens/LedgerGroupsScreen';
import { VoucherTypeScreen } from '../screens/VoucherTypeScreen';
import { useAuth } from '../context/AuthContext';
import { ledgerGroupService } from '../services/ledgerGroupService';
import { canAccessTab, pickInitialTab } from './guards';
import { colors } from '../constants/theme';
import { TopNavBar, TOP_NAV_HEIGHT, TOP_NAV_HEIGHT_MOBILE } from '../components/TopNavBar';
import type { AppTabsParamList } from './types';
import { useResponsive } from '../hooks/useResponsive';

const Tab = createBottomTabNavigator<AppTabsParamList>();

// Wraps a screen so its content always starts below the fixed top nav bar.
// Defined outside AppTabs to keep component identity stable across renders.
function withPad(Screen: React.ComponentType<any>): React.ComponentType<any> {
  return function PaddedScreen(props: any) {
    const { isMobile } = useResponsive();
    return (
      <View
        style={{
          flex: 1,
          paddingTop: isMobile ? TOP_NAV_HEIGHT_MOBILE : TOP_NAV_HEIGHT,
          backgroundColor: colors.background,
        }}
      >
        <Screen {...props} />
      </View>
    );
  };
}

const PaddedDashboard = withPad(DashboardScreen);
const PaddedBiltyStack = withPad(BiltyStack);
const PaddedBillingStack = withPad(BillingStack);
const PaddedReportsStack = withPad(ReportsStack);
const PaddedLedgerMaster = withPad(LedgerMasterScreen);
const PaddedCustomers = withPad(CustomersMasterScreen);
const PaddedOtherLedgers = withPad(OtherLedgersScreen);
const PaddedAgentMaster = withPad(AgentMasterScreen);
const PaddedItemMaster = withPad(ItemMasterScreen);
const PaddedItemGroup = withPad(ItemGroupScreen);
const PaddedItemCategory = withPad(ItemCategoryScreen);
const PaddedVehicleMaster = withPad(VehicleMasterScreen);
const PaddedDestinationMaster = withPad(DestinationMasterScreen);
const PaddedBranchMaster = withPad(BranchMasterScreen);
const PaddedLedgerGroups = withPad(LedgerGroupsScreen);
const PaddedVoucherType = withPad(VoucherTypeScreen);
const PaddedUsers = withPad(UsersScreen);

export function AppTabs() {
  const { user } = useAuth();
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [hasConsignorGroup, setHasConsignorGroup] = useState(false);
  const [hasConsigneeGroup, setHasConsigneeGroup] = useState(false);
  // Land the user on the first tab they can actually use, following the
  // nav-bar order. Without this, RN-Navigation defaults to the first
  // registered Tab.Screen — which can leave a voucher-only user staring
  // at the Bilty tab (which then redirects, causing a flash + loader).
  const initialTab = pickInitialTab(user);

  useEffect(() => {
    let cancelled = false;
    ledgerGroupService.list()
      .then((groups) => {
        if (cancelled) return;
        const names = new Set(groups.map((g) => g.group_name.toLowerCase()));
        setHasConsignorGroup(names.has('consignor'));
        setHasConsigneeGroup(names.has('consignee'));
        setGroupsLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setHasConsignorGroup(false);
        setHasConsigneeGroup(false);
        setGroupsLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  const showCustomerTab = useMemo(
    () => groupsLoaded && hasConsignorGroup && hasConsigneeGroup,
    [groupsLoaded, hasConsignorGroup, hasConsigneeGroup]
  );

  return (
    <Tab.Navigator
      tabBar={(props) => <TopNavBar {...props} />}
      initialRouteName={initialTab}
      sceneContainerStyle={{ backgroundColor: colors.background }}
      screenOptions={{
        headerShown: false,
      }}
    >
      {canAccessTab('Dashboard', user) && (
        <Tab.Screen name="Dashboard" component={PaddedDashboard} />
      )}
      {canAccessTab('Bilty', user) && (
        <Tab.Screen name="Bilty" component={PaddedBiltyStack} />
      )}
      {canAccessTab('Billing', user) && (
        <Tab.Screen name="Billing" component={PaddedBillingStack} />
      )}
      {canAccessTab('Reports', user) && (
        <Tab.Screen name="Reports" component={PaddedReportsStack} />
      )}
      {canAccessTab('LedgerMaster', user) && (
        <Tab.Screen name="LedgerMaster" component={PaddedLedgerMaster} />
      )}
      {showCustomerTab && canAccessTab('Customers', user) && (
        <Tab.Screen name="Customers" component={PaddedCustomers} />
      )}
      {canAccessTab('OtherLedgers', user) && (
        <Tab.Screen name="OtherLedgers" component={PaddedOtherLedgers} />
      )}
      {canAccessTab('AgentMaster', user) && (
        <Tab.Screen name="AgentMaster" component={PaddedAgentMaster} />
      )}
      {canAccessTab('ItemMaster', user) && (
        <Tab.Screen name="ItemMaster" component={PaddedItemMaster} />
      )}
      {canAccessTab('ItemGroup', user) && (
        <Tab.Screen name="ItemGroup" component={PaddedItemGroup} />
      )}
      {canAccessTab('ItemCategory', user) && (
        <Tab.Screen name="ItemCategory" component={PaddedItemCategory} />
      )}
      {canAccessTab('VehicleMaster', user) && (
        <Tab.Screen name="VehicleMaster" component={PaddedVehicleMaster} />
      )}
      {canAccessTab('DestinationMaster', user) && (
        <Tab.Screen name="DestinationMaster" component={PaddedDestinationMaster} />
      )}
      {canAccessTab('BranchMaster', user) && (
        <Tab.Screen name="BranchMaster" component={PaddedBranchMaster} />
      )}
      {canAccessTab('LedgerGroups', user) && (
        <Tab.Screen name="LedgerGroups" component={PaddedLedgerGroups} />
      )}
      {canAccessTab('VoucherType', user) && (
        <Tab.Screen name="VoucherType" component={PaddedVoucherType} />
      )}
      {canAccessTab('Users', user) && (
        <Tab.Screen name="Users" component={PaddedUsers} />
      )}
    </Tab.Navigator>
  );
}
