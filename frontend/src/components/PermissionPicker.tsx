/**
 * PermissionPicker — per-page CRUD permission grid.
 *
 * Each row corresponds to a page (Bilty / Freight / ...). The page label
 * acts as a "select-all-for-this-page" toggle; the four checkboxes next to
 * it correspond to the CRUD actions (View · Create · Edit · Delete).
 *
 * Semantics:
 *  - Wildcard ON  → value = ['*']; every action checkbox renders disabled +
 *                   checked as a visual hint that wildcard covers everything.
 *  - Wildcard OFF → individual action toggles edit value directly.
 *  - Page label   → if all four actions are already checked, unchecks all
 *                   four; otherwise checks all four (handy shortcut).
 *
 * Keyboard/a11y: each checkbox is a Pressable with role="checkbox" and
 * accessibilityState.checked.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ACTION_LABELS,
  PAGE_LABELS,
  PERMISSION_ACTIONS,
  PERMISSION_PAGES,
  VIEW_ONLY_PAGES,
  permKey,
} from '../constants/roles';
import type {
  Permission,
  PermissionAction,
  PermissionPage,
} from '../../../shared/types/user';
import { colors, radius, spacing, typography } from '../constants/theme';

interface Props {
  value: Permission[];
  onChange: (next: Permission[]) => void;
  disabled?: boolean;
  testID?: string;
}

export function PermissionPicker({ value, onChange, disabled = false, testID }: Props) {
  const isWildcard = value.length === 1 && value[0] === '*';

  const has = (perm: Permission): boolean => isWildcard || value.includes(perm);

  const toggleWildcard = () => {
    if (disabled) return;
    onChange(isWildcard ? [] : ['*']);
  };

  const toggleOne = (page: PermissionPage, action: PermissionAction) => {
    if (disabled || isWildcard) return;
    const perm = permKey(page, action);
    const viewPerm = permKey(page, 'view');
    const isOn = value.includes(perm);

    // Non-view actions are gated on view. If view isn't ticked, this checkbox
    // is unclickable — user has to enable view first.
    if (action !== 'view' && !value.includes(viewPerm)) return;

    if (isOn) {
      // Turning OFF view also strips create/edit/delete on the same page —
      // you literally cannot edit what you can't see.
      if (action === 'view') {
        const pageNonView = PERMISSION_ACTIONS
          .filter((a) => a !== 'view')
          .map((a) => permKey(page, a));
        onChange(value.filter((v) => v !== perm && !pageNonView.includes(v)));
      } else {
        onChange(value.filter((v) => v !== perm));
      }
      return;
    }

    onChange([...value, perm]);
  };

  const togglePageRow = (page: PermissionPage) => {
    if (disabled || isWildcard) return;
    const pagePerms = PERMISSION_ACTIONS.map((a) => permKey(page, a));
    const allChecked = pagePerms.every((p) => value.includes(p));
    if (allChecked) {
      // Strip every action for this page.
      onChange(value.filter((v) => !pagePerms.includes(v)));
    } else {
      // Add the missing action perms for this page.
      const missing = pagePerms.filter((p) => !value.includes(p));
      onChange([...value, ...missing]);
    }
  };

  return (
    <View testID={testID}>
      {/* Wildcard row */}
      <Pressable
        onPress={toggleWildcard}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isWildcard, disabled }}
        style={[styles.wildRow, disabled && styles.rowDisabled]}
        testID={testID ? `${testID}-wildcard` : undefined}
      >
        <Checkbox checked={isWildcard} disabled={disabled} />
        <Text style={[styles.label, styles.labelBold, disabled && styles.labelDisabled]}>
          All (wildcard)
        </Text>
      </Pressable>

      <View style={styles.divider} />

      {/* Header row over the action columns */}
      <View style={styles.headerRow}>
        <View style={styles.pageNameCell} />
        {PERMISSION_ACTIONS.map((a) => (
          <View key={a} style={styles.actionCell}>
            <Text style={styles.headerText}>{ACTION_LABELS[a]}</Text>
          </View>
        ))}
      </View>

      {/* Per-page rows */}
      {PERMISSION_PAGES.map((page) => {
        // View-only pages (e.g. daybook) only meaningfully expose `.view`.
        // Other action cells render empty so they can't be ticked.
        const isViewOnly = VIEW_ONLY_PAGES.includes(page);
        const actionsForPage = isViewOnly
          ? (['view'] as const)
          : PERMISSION_ACTIONS;
        const pagePerms = actionsForPage.map((a) => permKey(page, a));
        const allChecked = !isWildcard && pagePerms.every((p) => value.includes(p));
        const someChecked = !isWildcard && pagePerms.some((p) => value.includes(p));
        const rowDisabled = disabled || isWildcard;

        return (
          <View key={page} style={styles.pageRow}>
            {/* Page name doubles as a "toggle every action for this page" button */}
            <Pressable
              onPress={() => togglePageRow(page)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: allChecked, disabled: rowDisabled }}
              style={[styles.pageNameCell, rowDisabled && styles.rowDisabled]}
              testID={testID ? `${testID}-${page}-row` : undefined}
            >
              <Checkbox
                checked={isWildcard || allChecked}
                indeterminate={!allChecked && someChecked}
                disabled={rowDisabled}
              />
              <Text style={[styles.label, rowDisabled && styles.labelDisabled]}>
                {PAGE_LABELS[page]}
              </Text>
            </Pressable>

            {/* Action checkboxes (view-only pages render empty cells for the
                other actions so the column grid stays aligned). Non-view
                actions are locked until `view` is ticked — visually greyed. */}
            {PERMISSION_ACTIONS.map((a) => {
              if (isViewOnly && a !== 'view') {
                return <View key={a} style={styles.actionCell} />;
              }
              const perm = permKey(page, a);
              const checked = has(perm);
              const viewChecked = isWildcard || value.includes(permKey(page, 'view'));
              const lockedByView = a !== 'view' && !viewChecked;
              const cellDisabled = rowDisabled || lockedByView;
              return (
                <Pressable
                  key={a}
                  onPress={() => toggleOne(page, a)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked, disabled: cellDisabled }}
                  style={[styles.actionCell, cellDisabled && styles.rowDisabled]}
                  testID={testID ? `${testID}-${page}-${a}` : undefined}
                >
                  <Checkbox checked={checked} disabled={cellDisabled} />
                </Pressable>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

interface CheckboxProps {
  checked: boolean;
  disabled: boolean;
  indeterminate?: boolean;
}

function Checkbox({ checked, disabled, indeterminate }: CheckboxProps) {
  return (
    <View
      style={[
        styles.box,
        checked && styles.boxChecked,
        disabled && styles.boxDisabled,
      ]}
    >
      {checked ? (
        <Text style={styles.tick}>✓</Text>
      ) : indeterminate ? (
        <View style={styles.indeterminate} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wildRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.xs,
  },
  pageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    minHeight: 32,
  },
  pageNameCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 160,
    paddingRight: spacing.sm,
  },
  actionCell: {
    width: 76,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.uiBold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
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
  indeterminate: {
    width: 8,
    height: 2,
    backgroundColor: colors.primary,
    borderRadius: 1,
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
