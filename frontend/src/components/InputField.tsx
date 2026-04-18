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

export type FieldType = 'text' | 'integer' | 'decimal' | 'email' | 'phone';

interface Props extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | null;
  rightSlot?: React.ReactNode;
  testID?: string;
  fieldType?: FieldType;
}

const KEYBOARD_TYPE: Record<FieldType, TextInputProps['keyboardType']> = {
  text:    'default',
  integer: 'number-pad',
  decimal: 'decimal-pad',
  email:   'email-address',
  phone:   'phone-pad',
};

function filterValue(raw: string, fieldType: FieldType): string {
  if (fieldType === 'integer') return raw.replace(/[^0-9]/g, '');
  if (fieldType === 'decimal') {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    return parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned;
  }
  if (fieldType === 'phone') return raw.replace(/[^0-9+\-() ]/g, '');
  return raw;
}

export function InputField({
  label,
  error,
  rightSlot,
  value,
  onChangeText,
  testID,
  fieldType = 'text',
  ...rest
}: Props) {
  const [focused, setFocused] = useState(false);
  const borderColor = error
    ? colors.danger
    : focused
      ? colors.primary
      : colors.border;

  const handleChange = (raw: string) => {
    if (!onChangeText) return;
    onChangeText(filterValue(raw, fieldType));
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.row, { borderColor }]}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={colors.textMuted}
          keyboardType={KEYBOARD_TYPE[fieldType]}
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
