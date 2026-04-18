/**
 * Root navigator (AUTH-07, D-19).
 *
 * The sole gate:
 *   isLoading       → <Loader />        (bootstrap refresh in flight)
 *   isAuthenticated → <AppTabs />       (post-login, role-gated tabs)
 *   otherwise       → <AuthNavigator /> (LoginScreen)
 *
 * Individual screens do NOT call navigation.navigate('Login') —
 * the branch below IS the auth gate. Flipping `isAuthenticated` in
 * AuthContext automatically swaps the tree, so login() / logout()
 * are the only things that trigger navigation.
 */

import { useAuth } from '../context/AuthContext';
import { AuthNavigator } from './AuthNavigator';
import { AppTabs } from './AppTabs';
import { Loader } from '../components/Loader';

export function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <Loader />;
  return isAuthenticated ? <AppTabs /> : <AuthNavigator />;
}
