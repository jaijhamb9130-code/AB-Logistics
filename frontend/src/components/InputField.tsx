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
  Platform,
} from 'react-native';
import { colors, radius, spacing, typography } from '../constants/theme';

export type FieldType = 'text' | 'integer' | 'decimal' | 'email' | 'phone';

interface Props extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | null;
  hint?: string;
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
  if (fieldType === 'phone') return raw.replace(/\D/g, '').slice(0, 10);
  return raw;
}

export function InputField({
  label,
  error,
  hint,
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
      ? colors.brandRed
      : '#CBD5E1';

  const glowColor = error
    ? 'rgba(239, 68, 68, 0.15)'
    : 'rgba(247, 72, 61, 0.15)';

  const handleChange = (raw: string) => {
    if (!onChangeText) return;
    onChangeText(filterValue(raw, fieldType));
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[
        styles.row,
        { borderColor },
        focused && Platform.OS === 'web' && ({ boxShadow: `0 0 0 3px ${glowColor}` } as any),
      ]}>
        <TextInput
          style={[styles.input, Platform.OS === 'web' && ({ outline: 'none', border: 'none' } as any)]}
          value={value}
          onChangeText={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={colors.textMuted}
          keyboardType={KEYBOARD_TYPE[fieldType]}
          maxLength={fieldType === 'phone' ? 10 : undefined}
          testID={testID}
          {...rest}
        />
        {rightSlot}
      </View>
      {hint && !error ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: 12,
    color: colors.textLabel,
    marginBottom: 3,
    fontFamily: typography.uiBold,
    letterSpacing: 0.2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.text,
    fontFamily: typography.ui,
  },
  hint: {
    marginTop: 3,
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.ui,
  },
  error: {
    marginTop: spacing.xs,
    fontSize: 13,
    color: colors.danger,
    fontFamily: typography.ui,
  },
});
