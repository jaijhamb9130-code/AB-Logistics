/**
 * FreightStack — nested native stack inside the "Freight" tab (Phase 4).
 * Routes: FreightList → FreightDetail.
 * Memos are never created by this stack directly — generation is triggered
 * from BiltyDetailScreen per CLAUDE.md "Freight Memo is NEVER manually entered".
 */

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FreightMemoScreen } from '../screens/FreightMemoScreen';
import { FreightMemoDetailScreen } from '../screens/FreightMemoDetailScreen';
import { colors } from '../constants/theme';
import type { FreightStackParamList } from './types';

const Stack = createNativeStackNavigator<FreightStackParamList>();

export function FreightStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
      }}
    >
      <Stack.Screen
        name="FreightList"
        component={FreightMemoScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="FreightDetail"
        component={FreightMemoDetailScreen}
        options={{ title: 'Freight Memo' }}
      />
    </Stack.Navigator>
  );
}
