import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, spacing, typography } from '../constants/theme';

interface Props {
  onSync: () => Promise<void>;
  testID?: string;
}

export function SyncButton({ onSync, testID }: Props) {
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onSync();
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Sync failed. Try again.';
      Alert.alert('Tally sync', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityState={{ busy: loading }}
      testID={testID}
    >
      <Text style={styles.txt}>{loading ? 'Syncing…' : '⟳  Sync from Tally'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.brandRed,
    backgroundColor: 'transparent',
  },
  pressed: { opacity: 0.7 },
  txt: {
    color: colors.brandRed,
    fontFamily: typography.uiBold,
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 0.3,
  },
});
