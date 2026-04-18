/**
 * LoginScreen — STUB for Phase 1 Plan 03.
 * Plan 04 replaces this with the glassmorphism login card (D-04, D-05).
 * Intentionally minimal: TextInputs + Button + error text, nothing polished.
 */

import { useState } from 'react';
import {
  Button,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors, spacing } from '../constants/theme';

export function LoginScreen() {
  const { login, isLoading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    try {
      await login(username.trim(), password);
      // No manual navigate — AppNavigator flips to AppTabs automatically
      // once isAuthenticated becomes true (D-19).
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'login_failed';
      setError(msg);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>AB Logistics — Login (stub)</Text>

      <TextInput
        style={styles.input}
        placeholder="username"
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        style={styles.input}
        placeholder="password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        title={isLoading ? 'Signing in…' : 'Sign in'}
        onPress={onSubmit}
        disabled={isLoading || !username || !password}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
    color: colors.text,
  },
  error: {
    color: colors.danger,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
});
