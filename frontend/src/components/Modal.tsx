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
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
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
  /** Force a centered fade-in card (vs the default mobile bottom-sheet). */
  centered?: boolean;
}

export function Modal({
  visible,
  onClose,
  title,
  children,
  maxWidth = 520,
  testID,
  centered = false,
}: Props) {
  const { width, height } = useWindowDimensions();
  const isMobile = width < 768;
  // All modals now open as a centered, fade-in card on every screen size —
  // including mobile (previously a bottom slide-up sheet). The `centered` prop
  // is kept for API compatibility but the bottom-sheet layout is retired.
  void centered;
  const useBottomSheet = false;

  return (
    <RNModal
      visible={visible}
      onRequestClose={onClose}
      transparent
      animationType={useBottomSheet ? 'slide' : 'fade'}
    >
      <Pressable
        style={[styles.backdrop, useBottomSheet && styles.backdropMobile]}
        onPress={onClose}
        testID={testID ? `${testID}-backdrop` : undefined}
      >
        {/* stopPropagation via inner Pressable so taps inside the card don't close it */}
        <Pressable
          onPress={() => {}}
          style={[
            styles.card,
            { maxWidth: useBottomSheet ? width : maxWidth },
            useBottomSheet && {
              maxHeight: height * 0.92,
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              width: '100%',
            },
            !useBottomSheet && isMobile && {
              maxHeight: height * 0.86,
              width: width - 24,
            },
          ]}
        >
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
          <ScrollView
            style={
              useBottomSheet
                ? { maxHeight: height * 0.78 }
                : isMobile
                ? { maxHeight: height * 0.72 }
                : undefined
            }
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
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
  backdropMobile: {
    justifyContent: 'flex-end',
    padding: 0,
  },
  card: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...(Platform.OS === 'web' ? ({ overflow: 'visible' } as any) : { overflow: 'hidden' as const }),
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
