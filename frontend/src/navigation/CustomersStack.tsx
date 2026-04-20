import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CustomersScreen } from '../screens/CustomersScreen';
import type { CustomersStackParamList } from './types';

const Stack = createNativeStackNavigator<CustomersStackParamList>();

export function CustomersStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CustomerList" component={CustomersScreen} />
    </Stack.Navigator>
  );
}
