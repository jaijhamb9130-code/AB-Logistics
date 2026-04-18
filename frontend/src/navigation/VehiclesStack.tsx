/**
 * VehiclesStack — nested native stack inside the "Vehicles" tab (Phase 5).
 * Single screen for now (list + create/edit/deactivate modals inline).
 * Kept as a stack for future Vehicle Detail expansion.
 */

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { VehiclesScreen } from '../screens/VehiclesScreen';
import { colors } from '../constants/theme';
import type { VehiclesStackParamList } from './types';

const Stack = createNativeStackNavigator<VehiclesStackParamList>();

export function VehiclesStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
      }}
    >
      <Stack.Screen
        name="VehicleList"
        component={VehiclesScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
