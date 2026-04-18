/**
 * UsersScreen — STUB for Phase 1. Admin-only tab (AUTH-06).
 * Real user-management UI arrives in a later phase.
 */

import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../constants/theme';

export function UsersScreen() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Users (admin only)</Text>
      <Text style={styles.muted}>
        Stub — user management UI arrives in a later phase.
      </Text>
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
    marginBottom: spacing.sm,
  },
  muted: {
    color: colors.textMuted,
    textAlign: 'center',
  },
});
