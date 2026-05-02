/**
 * BillingStack — nested native stack inside the "Billing" tab (Phase 7).
 * Routes: VouchersList → VoucherForm / Daybook.
 */

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { VouchersListScreen } from '../screens/VouchersListScreen';
import { VoucherFormScreen } from '../screens/VoucherFormScreen';
import { DaybookScreen } from '../screens/DaybookScreen';
import { colors } from '../constants/theme';
import type { BillingStackParamList } from './types';

const Stack = createNativeStackNavigator<BillingStackParamList>();

export function BillingStack() {
  return (
    <Stack.Navigator
      initialRouteName="VoucherForm"
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
      }}
    >
      <Stack.Screen
        name="VouchersList"
        component={VouchersListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="VoucherForm"
        component={VoucherFormScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Daybook"
        component={DaybookScreen}
        options={{ title: 'Daybook' }}
      />
    </Stack.Navigator>
  );
}
