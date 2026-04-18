/**
 * DashboardScreen — STUB for Phase 1.
 * Plan 04+ layers the real glass summary cards on top.
 * Exposes a Logout button so manual smoke testing works end-to-end.
 */

import { Button, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { colors, spacing } from '../constants/theme';

export function DashboardScreen() {
  const { user, logout } = useAuth();
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Dashboard (stub)</Text>
      <Text style={styles.muted}>
        Signed in as <Text style={styles.bold}>{user?.username ?? '—'}</Text>
      </Text>
      <Text style={styles.muted}>
        Role: <Text style={styles.bold}>{user?.role ?? '—'}</Text>
      </Text>
      <View style={{ height: spacing.lg }} />
      <Button title="Logout" color={colors.danger} onPress={logout} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '600',
    marginBottom: spacing.lg,
  },
  muted: {
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  bold: {
    color: colors.text,
    fontWeight: '600',
  },
});
