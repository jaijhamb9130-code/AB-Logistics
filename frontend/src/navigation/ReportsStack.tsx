import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { ReportsStackParamList } from './types';
import { ReportsHubScreen } from '../screens/ReportsHubScreen';
import { BiltyRegisterScreen } from '../screens/BiltyRegisterScreen';
import { VoucherRegisterScreen } from '../screens/VoucherRegisterScreen';
import { LedgerStatementScreen } from '../screens/LedgerStatementScreen';
import { GroupSummaryScreen } from '../screens/GroupSummaryScreen';
import { GroupLedgersScreen } from '../screens/GroupLedgersScreen';

const Stack = createNativeStackNavigator<ReportsStackParamList>();

export function ReportsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ReportsHub" component={ReportsHubScreen} />
      <Stack.Screen name="BiltyRegister" component={BiltyRegisterScreen} />
      <Stack.Screen name="VoucherRegister" component={VoucherRegisterScreen} />
      <Stack.Screen name="LedgerStatement" component={LedgerStatementScreen} />
      <Stack.Screen name="GroupSummary" component={GroupSummaryScreen} />
      <Stack.Screen name="GroupLedgers" component={GroupLedgersScreen} />
    </Stack.Navigator>
  );
}
