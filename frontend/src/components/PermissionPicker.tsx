/**
 * PermissionPicker — multi-select checkbox grid over PERMISSION_LIST
 * with a dedicated wildcard ('*') toggle (plan 02-02).
 *
 * Semantics:
 *  - Wildcard ON  → value = ['*'] and the 8 individual checkboxes render
 *                   disabled + checked (visual hint that wildcard covers them).
 *  - Wildcard OFF (toggling off from wildcard) → value = []
 *  - Individual checkbox toggle → add/remove that Permission from the array.
 *
 * Keyboard/a11y: each row is a Pressable with role="checkbox" and
 * accessibilityState.checked.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  PERMISSION_LABELS,
  PERMISSION_LIST,
} from '../constants/roles';
import type { Permission } from '../../../shared/types/user';
import { colors, radius, spacing, typography } from '../constants/theme';

interface Props {
  value: Permission[];
  onChange: (next: Permission[]) => void;
  disabled?: boolean;
  testID?: string;
}

export function PermissionPicker({ value, onChange, disabled = false, testID }: Props) {
  const isWildcard = value.length === 1 && value[0] === '*';

  const toggleWildcard = () => {
    if (disabled) return;
    if (isWildcard) {
      onChange([]);
    } else {
      onChange(['*']);
    }
  };

  const toggleOne = (p: Permission) => {
    if (disabled || isWildcard) return;
    if (value.includes(p)) {
      onChange(value.filter((v) => v !== p));
    } else {
      onChange([...value, p]);
    }
  };

  return (
    <View testID={testID}>
      {/* Wildcard row — visually separated */}
      <PermissionRow
        label={PERMISSION_LABELS['*']}
        checked={isWildcard}
        disabled={disabled}
        onToggle={toggleWildcard}
        wildcard
        testID={testID ? `${testID}-wildcard` : undefined}
      />

      <View style={styles.divider} />

      {/* 2-column grid of permission rows */}
      <View style={styles.grid}>
        {PERMISSION_LIST.map((p) => {
          const checked = isWildcard || value.includes(p);
          return (
            <View key={p} style={styles.col}>
              <PermissionRow
                label={PERMISSION_LABELS[p]}
                checked={checked}
                disabled={disabled || isWildcard}
                onToggle={() => toggleOne(p)}
                testID={testID ? `${testID}-${p}` : undefined}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

interface RowProps {
  label: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  wildcard?: boolean;
  testID?: string;
}

function PermissionRow({
  label,
  checked,
  disabled,
  onToggle,
  wildcard,
  testID,
}: RowProps) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      style={[styles.row, disabled && styles.rowDisabled]}
      testID={testID}
    >
      <View
        style={[
          styles.box,
          checked && styles.boxChecked,
          disabled && styles.boxDisabled,
        ]}
      >
        {checked ? <Text style={styles.tick}>✓</Text> : null}
      </View>
      <Text
        style={[
          styles.label,
          wildcard && styles.labelBold,
          disabled && styles.labelDisabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  col: {
    width: '50%',
    paddingVertical: spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  rowDisabled: {
    opacity: 0.55,
  },
  box: {
    width: 18,
    height: 18,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  boxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  boxDisabled: {
    borderColor: colors.border,
  },
  tick: {
    color: colors.card,
    fontSize: 12,
    fontFamily: typography.uiBold,
    lineHeight: 14,
  },
  label: {
    fontSize: 13,
    color: colors.text,
    fontFamily: typography.ui,
    flexShrink: 1,
  },
  labelBold: {
    fontFamily: typography.uiBold,
  },
  labelDisabled: {
    color: colors.textMuted,
  },
});
