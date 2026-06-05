/**
 * PrefixedNumberInput — a number field with a FIXED, locked prefix segment.
 *
 * When `prefix` is set, the field shows a non-editable grey "<prefix>-" lead
 * (e.g. "BLT-") and the user can only type/edit the number after it — the
 * prefix can't be selected or deleted. When `prefix` is empty/null it behaves
 * as a plain digits field (numbering starts directly).
 *
 * `value` is the FULL stored value ("BLT-001" or "001"); `onChangeText` emits
 * the full value, or '' when the number is cleared (so "required" still fires).
 *
 * Visual structure mirrors InputField so it slots into the same forms.
 */

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Platform,
  type TextInputProps,
} from 'react-native';
import { colors, radius, spacing, typography } from '../constants/theme';

interface Props extends Omit<TextInputProps, 'style' | 'value' | 'onChangeText'> {
  label: string;
  /** Fixed prefix WITHOUT the trailing dash (e.g. "BLT"). Empty/null = plain number. */
  prefix?: string | null;
  /** Full stored value, e.g. "BLT-001" or "001". */
  value: string;
  /** Emits the full value ("<prefix>-<digits>") or "" when the number is empty. */
  onChangeText: (full: string) => void;
  error?: string | null;
  compact?: boolean;
  testID?: string;
  /** Skip the built-in label (the parent renders its own). */
  hideLabel?: boolean;
  /** Web-only data-* attributes forwarded to the input (used for guided-entry tagging). */
  dataSet?: Record<string, string>;
}

export type PrefixedNumberHandle = { focus: () => void };

export const PrefixedNumberInput = forwardRef<PrefixedNumberHandle, Props>(function PrefixedNumberInput({
  label,
  prefix,
  value,
  onChangeText,
  error,
  compact,
  testID,
  placeholder,
  hideLabel,
  ...rest
}: Props, ref) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  // Stable, unique field name per instance — defeats Chrome's autofill /
  // form-restoration without changing on every render.
  const nameRef = useRef(`bn_${Math.random().toString(36).slice(2, 8)}`);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus?.() }), []);

  // Bulletproof autofill/restore opt-out: set the attributes straight on the DOM
  // input (bypasses RNW prop normalisation). A unique `name` means Chrome has no
  // saved history for this field, so it can't refill an old number on reload.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el: any = inputRef.current;
    if (el && typeof el.setAttribute === 'function') {
      el.setAttribute('autocomplete', 'off');
      el.setAttribute('autocorrect', 'off');
      el.setAttribute('autocapitalize', 'off');
      el.setAttribute('name', nameRef.current);
      el.setAttribute('data-lpignore', 'true');
      el.setAttribute('data-1p-ignore', 'true');
    }
  }, []);
  const hasPrefix = !!(prefix && prefix.trim());
  const lead = hasPrefix ? `${prefix}-` : '';

  // The editable number portion = the value with the locked prefix stripped.
  const numberPart = hasPrefix
    ? (value && value.startsWith(lead)
        ? value.slice(lead.length)
        : (value || '').replace(/\D/g, ''))
    : (value || '');

  const borderColor = error ? colors.danger : focused ? '#2563EB' : '#CBD5E1';
  const glowColor = error ? 'rgba(239,68,68,0.15)' : 'rgba(37,99,235,0.12)';

  const handle = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (!hasPrefix) { onChangeText(digits); return; }
    onChangeText(digits ? `${lead}${digits}` : '');
  };

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {!hideLabel ? (
        <Text style={[styles.label, compact && styles.labelCompact]}>{label}</Text>
      ) : null}
      <View
        style={[
          styles.row,
          { borderColor },
          compact && styles.rowCompact,
          focused && Platform.OS === 'web' && ({ boxShadow: `0 0 0 3px ${glowColor}` } as any),
        ]}
      >
        {hasPrefix ? (
          <View style={styles.prefixBox}>
            <Text style={styles.prefixText} selectable={false}>{lead}</Text>
          </View>
        ) : null}
        <TextInput
          ref={inputRef}
          style={[
            styles.input,
            compact && styles.inputCompact,
            Platform.OS === 'web' && ({ outlineStyle: 'none', borderWidth: 0 } as any),
          ]}
          value={numberPart}
          onChangeText={handle}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad"
          placeholder={placeholder}
          testID={testID}
          // Stop the browser restoring the last typed number on reload (that's
          // what made an old number reappear over the fetched next-number). The
          // DOM effect above reinforces this with a unique field name.
          autoComplete="off"
          autoCorrect={false}
          spellCheck={false}
          {...(rest as any)}
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginBottom: 4 },
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
  // Locked prefix segment — greyed, with a divider before the editable number.
  prefixBox: {
    justifyContent: 'center',
    paddingRight: 8,
    marginRight: 8,
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  prefixText: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: typography.uiBold,
    letterSpacing: 0.3,
    ...(Platform.OS === 'web' ? ({ userSelect: 'none' } as any) : {}),
  },
  input: {
    flex: 1,
    paddingVertical: 6,
    fontSize: 13,
    // Monospaced, strong-contrast, bold — the number reads clearly next to the
    // locked prefix.
    color: colors.textStrong,
    fontFamily: typography.mono,
    fontWeight: '700',
  },
  error: {
    marginTop: spacing.xs,
    fontSize: 13,
    color: colors.danger,
    fontFamily: typography.ui,
  },

  // Compact variant — matches InputField compact (mobile bilty wizard).
  wrapCompact: { marginBottom: 0 },
  labelCompact: {
    fontSize: 10,
    color: colors.textMuted,
    fontFamily: typography.uiHeavy,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  rowCompact: { paddingHorizontal: 10, minHeight: 38 },
  inputCompact: {
    paddingVertical: 0,
    height: 36,
    fontSize: 13,
    fontFamily: typography.uiMedium,
  },
});
