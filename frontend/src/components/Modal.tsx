/**
 * Modal — cross-platform centered dialog (plan 02-02).
 *
 * Wraps React Native's built-in Modal (works on web via RN Web).
 * Backdrop press calls onClose. Renders a card (colors.card, radius.lg)
 * above a translucent backdrop. Provides a header bar with title + "×"
 * close control.
 *
 * All styling via theme tokens — no hardcoded hex. The backdrop rgba is a
 * semantic overlay derived from the text color, not a theme color per se.
 *
 * Reused by plan 02-03 for the Edit User flow.
 */

import React from 'react';
import {
  Modal as RNModal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radius, spacing, typography } from '../constants/theme';

// Semantic overlay (slate-900 @ 45%) — intentional derived overlay, not a theme color.
const BACKDROP = 'rgba(15,23,42,0.45)';

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Max inner card width in px. Default 520. */
  maxWidth?: number;
  testID?: string;
}

export function Modal({
  visible,
  onClose,
  title,
  children,
  maxWidth = 520,
  testID,
}: Props) {
  return (
    <RNModal
      visible={visible}
      onRequestClose={onClose}
      transparent
      animationType="fade"
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        testID={testID ? `${testID}-backdrop` : undefined}
      >
        {/* stopPropagation via inner Pressable so taps inside the card don't close it */}
        <Pressable onPress={() => {}} style={[styles.card, { maxWidth }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityLabel="Close"
              testID={testID ? `${testID}-close` : undefined}
            >
              <Text style={styles.close}>×</Text>
            </Pressable>
          </View>
          <View style={styles.body}>{children}</View>
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: BACKDROP,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 16,
    color: colors.text,
    fontFamily: typography.uiBold,
  },
  close: {
    fontSize: 24,
    color: colors.textMuted,
    fontFamily: typography.ui,
    lineHeight: 24,
    paddingHorizontal: spacing.sm,
  },
  body: {
    padding: spacing.lg,
  },
});
