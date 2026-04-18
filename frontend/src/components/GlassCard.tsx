/**
 * GlassCard — reusable BlurView wrapper (D-05).
 *
 * Used by LoginScreen (Plan 04) and later by Dashboard summary cards (D-04).
 * Web intensity is lighter because expo-blur on web uses CSS backdrop-filter,
 * which is heavier perceptually than the native BlurView.
 *
 * Note on color: the inner `rgba(255,255,255,0.55)` is a FUNCTIONAL
 * transparency used to make the blur readable — not a theme color. It is
 * the only non-theme color literal allowed in this file.
 */

import React from 'react';
import { BlurView } from 'expo-blur';
import {
  View,
  StyleSheet,
  Platform,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { colors, radius, spacing } from '../constants/theme';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function GlassCard({ children, style }: Props) {
  return (
    <BlurView
      intensity={Platform.OS === 'web' ? 40 : 60}
      tint="light"
      style={[styles.card, style]}
    >
      <View style={styles.inner}>{children}</View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    // Semi-transparent white is a deliberate glass effect, not a theme color.
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  inner: {
    padding: spacing.xl,
  },
});
