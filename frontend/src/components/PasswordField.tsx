/**
 * PasswordField — masked input with visibility toggle (AUTH-03).
 *
 * Composes InputField; passes a Pressable "Show"/"Hide" control as `rightSlot`.
 * Starts masked (secureTextEntry=true); tap toggles state.
 *
 * TODO: replace Show/Hide text with an eye icon from @expo/vector-icons
 *       in a later polish phase.
 */

import React, { useState } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import { InputField } from './InputField';
import { colors, spacing, typography } from '../constants/theme';

interface Props {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string | null;
  testID?: string;
}

export function PasswordField({
  label,
  value,
  onChangeText,
  error,
  testID,
}: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <InputField
      label={label}
      value={value}
      onChangeText={onChangeText}
      error={error}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      testID={testID}
      rightSlot={
        <Pressable
          onPress={() => setVisible((v) => !v)}
          hitSlop={8}
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        >
          <Text style={styles.toggle}>{visible ? 'Hide' : 'Show'}</Text>
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  toggle: {
    color: colors.primary,
    fontSize: 13,
    paddingHorizontal: spacing.sm,
    fontFamily: typography.uiBold,
  },
});
