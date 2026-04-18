import { SafeAreaView, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { colors } from './src/constants/theme';

export default function App() {
  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.primary, fontSize: 18, fontWeight: '600' }}>
        AB Logistics — Foundation scaffold OK
      </Text>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}
