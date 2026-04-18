/**
 * ButtonPrimary — primary CTA with loading state (AUTH-04).
 *
 * Disabled behavior:
 *  - disabled prop OR loading=true  → Pressable is inert (no onPress)
 *  - loading=true                   → ActivityIndicator replaces label
 *  - accessibilityState.busy        → true while loading (screen reader cue)
 */

import React from 'react';
import { Pressable, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, radius, spacing, typography } from '../constants/theme';

interface Props {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
}

export function ButtonPrimary({
  title,
  onPress,
  loading = false,
  disabled = false,
  testID,
}: Props) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      style={[styles.btn, { opacity: isDisabled ? 0.6 : 1 }]}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator color={colors.card} />
      ) : (
        <Text style={styles.label}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: colors.brandRed,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: typography.uiBold,
    letterSpacing: 0.3,
  },
});
