/**
 * ConfirmDialog — reusable destructive-action confirmation primitive
 * (plan 02-03 / Task 1).
 *
 * Composes the plan-02-02 <Modal/> (does NOT duplicate modal / backdrop /
 * close logic). Renders a title + message + Cancel / Confirm buttons.
 *
 * Props
 *  - visible       : controls the underlying Modal
 *  - onCancel      : called on backdrop tap, close "×", or Cancel button
 *  - onConfirm     : called on Confirm button press (parent owns the await)
 *  - title         : Modal header text
 *  - message       : body copy
 *  - confirmLabel? : defaults to 'Confirm'
 *  - cancelLabel?  : defaults to 'Cancel'
 *  - danger?       : when true, the confirm button is tinted colors.danger
 *                    (used for deactivate / delete flows — T-02-18)
 *  - loading?      : disables both buttons and dims the confirm button
 *
 * All styling via theme tokens — zero hardcoded hex. Reused by plan 02-03
 * (deactivate user) and any future destructive-action flows in phases 3+.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Modal } from './Modal';
import { colors, radius, spacing, typography } from '../constants/theme';

interface Props {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  testID?: string;
}

export function ConfirmDialog({
  visible,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  loading = false,
  testID,
}: Props) {
  const confirmBg = danger ? colors.danger : colors.primary;
  const isDisabled = loading;

  return (
    <Modal
      visible={visible}
      onClose={onCancel}
      title={title}
      maxWidth={460}
      testID={testID}
    >
      <Text style={styles.message} testID={testID ? `${testID}-message` : undefined}>
        {message}
      </Text>

      <View style={styles.actions}>
        <Pressable
          onPress={isDisabled ? undefined : onCancel}
          style={styles.cancelBtn}
          accessibilityRole="button"
          accessibilityState={{ disabled: isDisabled }}
          testID={testID ? `${testID}-cancel` : undefined}
        >
          <Text style={styles.cancelBtnText}>{cancelLabel}</Text>
        </Pressable>

        <Pressable
          onPress={isDisabled ? undefined : onConfirm}
          style={[
            styles.confirmBtn,
            { backgroundColor: confirmBg, opacity: isDisabled ? 0.6 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: isDisabled, busy: loading }}
          testID={testID ? `${testID}-confirm` : undefined}
        >
          {loading ? (
            <ActivityIndicator color={colors.card} />
          ) : (
            <Text style={styles.confirmBtnText}>{confirmLabel}</Text>
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  message: {
    color: colors.text,
    fontFamily: typography.ui,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
  cancelBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  cancelBtnText: {
    color: colors.textMuted,
    fontFamily: typography.uiBold,
    fontSize: 14,
  },
  confirmBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  confirmBtnText: {
    color: colors.card,
    fontFamily: typography.uiBold,
    fontSize: 14,
  },
});
