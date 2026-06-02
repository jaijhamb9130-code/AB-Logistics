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

import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  Platform,
} from 'react-native';
import { colors, radius, spacing, typography } from '../constants/theme';

export type FieldType = 'text' | 'integer' | 'decimal' | 'email' | 'phone' | 'letters' | 'alphanumeric' | 'date';

interface Props extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | null;
  hint?: string;
  rightSlot?: React.ReactNode;
  testID?: string;
  fieldType?: FieldType;
  /** When true, render with mobile-form compact dimensions (38px input, 11px uppercase label, no marginBottom). */
  compact?: boolean;
  /** Web-only data-* attributes forwarded to the input (used for guided-entry tagging). */
  dataSet?: Record<string, string>;
}

const KEYBOARD_TYPE: Record<FieldType, TextInputProps['keyboardType']> = {
  text:         'default',
  integer:      'number-pad',
  decimal:      'decimal-pad',
  email:        'email-address',
  phone:        'phone-pad',
  letters:      'default',
  alphanumeric: 'default',
  date:         'default',
};

function filterValue(raw: string, fieldType: FieldType): string {
  if (fieldType === 'integer') return raw.replace(/[^0-9]/g, '');
  if (fieldType === 'decimal') {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    return parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned;
  }
  if (fieldType === 'phone') return raw.replace(/\D/g, '').slice(0, 10);
  if (fieldType === 'letters') return raw.replace(/[^a-zA-Z\s'.\-]/g, '');
  if (fieldType === 'alphanumeric') return raw.replace(/[^a-zA-Z0-9\s\-_.\/]/g, '');
  if (fieldType === 'date') return raw.replace(/[^0-9\-]/g, '').slice(0, 10);
  return raw;
}

export type InputFieldHandle = { focus: () => void };

export const InputField = forwardRef<InputFieldHandle, Props>(function InputField({
  label,
  error,
  hint,
  rightSlot,
  value,
  onChangeText,
  testID,
  fieldType = 'text',
  compact,
  ...rest
}: Props, ref) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus?.() }), []);
  // Focus ring is a calm slate-blue, not the brand red — bright red on a
  // focused field reads as a validation error to users (it isn't).
  const borderColor = error
    ? colors.danger
    : focused
      ? '#2563EB'
      : '#CBD5E1';

  const glowColor = error
    ? 'rgba(239, 68, 68, 0.15)'
    : 'rgba(37, 99, 235, 0.12)';

  const isNumeric = fieldType === 'integer' || fieldType === 'decimal';

  // For numeric fields: hide leading zeros so the user can start typing
  // immediately, and store "0" when the field is left blank so form state
  // remains a valid number.
  const isZeroish =
    isNumeric && (value === '' || value === '0' || value === '0.0' || Number(value) === 0);
  const displayValue = isZeroish ? '' : value;

  const handleChange = (raw: string) => {
    if (!onChangeText) return;
    if (isNumeric && raw === '') {
      onChangeText('0');
      return;
    }
    onChangeText(filterValue(raw, fieldType));
  };

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Text style={[styles.label, compact && styles.labelCompact]}>{label}</Text>
      <View style={[
        styles.row,
        { borderColor },
        compact && styles.rowCompact,
        focused && Platform.OS === 'web' && ({ boxShadow: `0 0 0 3px ${glowColor}` } as any),
      ]}>
        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            compact && styles.inputCompact,
            isNumeric && styles.inputNumeric,
            Platform.OS === 'web' && ({ outlineStyle: 'none', borderWidth: 0 } as any),
          ]}
          value={displayValue}
          onChangeText={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={colors.textMuted}
          keyboardType={KEYBOARD_TYPE[fieldType]}
          maxLength={fieldType === 'phone' ? 10 : undefined}
          testID={testID}
          {...(rest as any)}
        />
        {rightSlot}
      </View>
      {hint && !error ? <Text style={styles.hint}>{hint}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    color: colors.textLabel,
    marginBottom: 2,
    fontFamily: typography.uiBold,
    letterSpacing: 0.2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: colors.card,
    paddingHorizontal: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 6,
    fontSize: 13,
    color: colors.text,
    fontFamily: typography.ui,
  },
  // Numeric fields: monospaced, strong-contrast, bold so the digits read clearly.
  inputNumeric: {
    fontFamily: typography.mono,
    color: colors.textStrong,
    fontWeight: '700',
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

  // Compact variant — used by mobile bilty wizard for tight, balanced rows.
  wrapCompact: { marginBottom: 0 },
  labelCompact: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: typography.uiHeavy,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  rowCompact: {
    paddingHorizontal: 10,
    minHeight: 38,
  },
  inputCompact: {
    paddingVertical: 0,
    height: 36,
    fontSize: 13,
    fontFamily: typography.uiMedium,
  },
});
