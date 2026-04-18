/**
 * Theme tokens — locked per D-06 (colors) and D-07 (typography).
 * Single source of truth. Screens and components MUST import from here
 * and never hardcode hex values or raw fontSize/fontFamily pairs — use
 * the `text` presets below.
 */

import { Platform, type TextStyle } from 'react-native';

export const colors = {
  primary: '#0F172A',
  background: '#F5F7FA',
  card: '#FFFFFF',
  border: '#E2E8F0',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  text: '#0F172A',
  textStrong: '#111827',
  textLabel: '#475569',
  textMuted: '#64748B',
  // Brand palette — pulled from ABS logo.
  // Use the `Tone` variants for surfaces / backgrounds / accents.
  // Full-strength values kept for tiny visual cues (badges, divider dots).
  brandRed: '#F7483D',
  brandRedTone: '#FEE9E7',
  brandRedBorder: '#FBC4BE',
  brandYellow: '#FFCC3D',
  brandYellowTone: '#FFF6D9',
  brandYellowBorder: '#FFE8A3',
  brandBlack: '#0F172A',
  brandSurface: '#FFFBF0',
} as const;

export const typography = {
  ui: 'Inter_400Regular',
  uiMedium: 'Inter_500Medium',
  uiBold: 'Inter_600SemiBold',
  uiHeavy: 'Inter_700Bold',
  mono: 'JetBrainsMono_400Regular',
} as const;

const isWeb = Platform.OS === 'web';
const bump = (mobile: number, webBump = 2) => (isWeb ? mobile + webBump : mobile);

/**
 * Typography presets — use these via `...text.heading` / `...text.label`
 * in StyleSheet.create. Weights pair with fontFamily so the font files
 * pick up correctly when loaded; on native fallback, fontWeight still wins.
 * Heading > Value > Label > Meta hierarchy is enforced by size + weight.
 */
export const text = {
  heading: {
    fontFamily: typography.uiHeavy,
    fontSize: bump(18),
    fontWeight: '700',
    letterSpacing: 0.3,
    color: colors.text,
    lineHeight: bump(18) * 1.35,
  },
  subheading: {
    fontFamily: typography.uiBold,
    fontSize: bump(15),
    fontWeight: '600',
    letterSpacing: 0.2,
    color: colors.text,
    lineHeight: bump(15) * 1.4,
  },
  label: {
    fontFamily: typography.uiBold,
    fontSize: bump(13),
    fontWeight: '600',
    color: colors.textLabel,
    lineHeight: bump(13) * 1.4,
  },
  value: {
    fontFamily: typography.uiMedium,
    fontSize: bump(14),
    fontWeight: '500',
    color: colors.textStrong,
    lineHeight: bump(14) * 1.45,
  },
  valueStrong: {
    fontFamily: typography.uiBold,
    fontSize: bump(15),
    fontWeight: '600',
    color: colors.textStrong,
    lineHeight: bump(15) * 1.4,
  },
  meta: {
    fontFamily: typography.uiMedium,
    fontSize: bump(12, 1),
    fontWeight: '500',
    color: colors.textMuted,
    lineHeight: bump(12, 1) * 1.4,
  },
  pill: {
    fontFamily: typography.uiBold,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    lineHeight: 16,
  },
  action: {
    fontFamily: typography.uiBold,
    fontSize: bump(13, 1),
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  numeric: {
    fontFamily: typography.mono,
    fontSize: bump(14),
    fontWeight: '500',
    color: colors.textStrong,
  },
} as const satisfies Record<string, TextStyle>;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
} as const;

export type Colors = typeof colors;
export type Typography = typeof typography;
export type TextPresets = typeof text;
export type Spacing = typeof spacing;
export type Radius = typeof radius;
