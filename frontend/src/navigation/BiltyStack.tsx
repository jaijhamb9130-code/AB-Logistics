/**
 * BiltyStack — nested native stack inside the "Bilty" tab (Phase 3).
 * Routes: BiltyList → BiltyForm / BiltyDetail.
 */

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BiltyScreen } from '../screens/BiltyScreen';
import { BiltyFormScreen } from '../screens/BiltyFormScreen';
import { BiltyDetailScreen } from '../screens/BiltyDetailScreen';
import { colors } from '../constants/theme';
import type { BiltyStackParamList } from './types';

const Stack = createNativeStackNavigator<BiltyStackParamList>();

export function BiltyStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
      }}
    >
      <Stack.Screen
        name="BiltyList"
        component={BiltyScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="BiltyForm"
        component={BiltyFormScreen}
        options={{ title: 'New Bilty' }}
      />
      <Stack.Screen
        name="BiltyDetail"
        component={BiltyDetailScreen}
        options={{ title: 'Bilty Detail' }}
      />
    </Stack.Navigator>
  );
}
