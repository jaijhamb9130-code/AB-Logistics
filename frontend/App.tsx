import { NavigationContainer, type LinkingOptions } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './src/context/AuthContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { Loader } from './src/components/Loader';

// React Navigation web-linking config. Right now we only customise URLs that
// the user reads/types directly — primarily the bilty editor, where the URL
// should carry the human-readable bilty_no (e.g. /edit/bilty/18520) rather
// than an opaque DB id. Other screens fall through to React Navigation's
// default state↔path serialisation.
const linking: LinkingOptions<ReactNavigation.RootParamList> = {
  prefixes: [],
  config: {
    screens: {
      Dashboard: 'dashboard',
      Bilty: {
        path: 'bilty',
        screens: {
          BiltyList: '',
          BiltyDetail: 'view/:id',
          BiltyForm: 'edit/:id',
        },
      },
      Billing: {
        path: 'billing',
        screens: {
          Daybook: '',
          VoucherForm: 'voucher',
          VouchersList: 'list',
        },
      },
      Reports: {
        path: 'reports',
        screens: {
          ReportsHub: '',
          BiltyRegister: 'bilty-register',
          VoucherRegister: 'voucher-register',
          LedgerStatement: 'ledger-statement',
          GroupSummary: 'group-summary',
          GroupLedgers: 'group-ledgers',
        },
      },
      LedgerMaster: 'ledger-master',
      Customers: 'customers',
      OtherLedgers: 'other-ledgers',
      AgentMaster: 'agents',
      ItemMaster: 'items',
      ItemGroup: 'item-groups',
      ItemCategory: 'item-categories',
      VehicleMaster: 'vehicles',
      DestinationMaster: 'destinations',
      BranchMaster: 'branches',
      LedgerGroups: 'ledger-groups',
      VoucherType: 'voucher-types',
      Users: 'users',
    },
  },
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
    mutations: { retry: 0 },
  },
});

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
  });

  if (!fontsLoaded) return <Loader />;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AuthProvider>
          <NavigationContainer linking={linking}>
            <AppNavigator />
            <StatusBar style="auto" />
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
