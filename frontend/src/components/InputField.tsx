/**
 * InputField — labeled text input with error state and focus styling.
 *
 * Border color:
 *   - error present     → colors.danger
 *   - focused + no err  → colors.primary
 *   - otherwise         → colors.border
 *
 * `rightSlot` is used by PasswordField to render the Show/Hide toggle.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
} from 'react-native';
import { colors, radius, spacing, typography } from '../constants/theme';

interface Props extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | null;
  rightSlot?: React.ReactNode;
  testID?: string;
}

export function InputField({
  label,
  error,
  rightSlot,
  value,
  onChangeText,
  testID,
  ...rest
}: Props) {
  const [focused, setFocused] = useState(false);
  const borderColor = error
    ? colors.danger
    : focused
      ? colors.primary
      : colors.border;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.row, { borderColor }]}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={colors.textMuted}
          testID={testID}
          {...rest}
        />
        {rightSlot}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    fontFamily: typography.ui,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
    fontFamily: typography.ui,
  },
  error: {
    marginTop: spacing.xs,
    fontSize: 12,
    color: colors.danger,
    fontFamily: typography.ui,
  },
});
