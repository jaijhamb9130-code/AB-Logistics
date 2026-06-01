/**
 * BillingStack — nested native stack inside the "Billing" tab (Phase 7).
 * Routes: VouchersList → VoucherForm / Daybook.
 *
 * Initial route is permission-aware: a user with `daybook.view` but no
 * `voucher.create` lands on Daybook (not the create form they can't use).
 */

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { VouchersListScreen } from '../screens/VouchersListScreen';
import { VoucherFormScreen } from '../screens/VoucherFormScreen';
import { DaybookScreen } from '../screens/DaybookScreen';
import { colors } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { canDoAction } from './guards';
import type { BillingStackParamList } from './types';

const Stack = createNativeStackNavigator<BillingStackParamList>();

export function BillingStack() {
  const { user } = useAuth();
  // Pick the landing screen based on what the user can actually use.
  // Order: VoucherForm (needs create) → Daybook (daybook.view OR voucher.view)
  // → VoucherForm fallback.
  const initial: keyof BillingStackParamList = canDoAction(user, 'voucher', 'create')
    ? 'VoucherForm'
    : (canDoAction(user, 'daybook', 'view') || canDoAction(user, 'voucher', 'view'))
      ? 'Daybook'
      : 'VoucherForm';

  return (
    <Stack.Navigator
      initialRouteName={initial}
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
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
