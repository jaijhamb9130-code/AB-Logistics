/**
 * Theme tokens — locked per D-06 (colors) and D-07 (typography).
 * Single source of truth. Screens and components MUST import from here
 * and never hardcode hex values.
 */

export const colors = {
  primary: '#2F6FED',
  background: '#F5F7FA',
  card: '#FFFFFF',
  border: '#E2E8F0',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  text: '#0F172A',
  textMuted: '#64748B',
} as const;

export const typography = {
  // UI text — Inter / Roboto (system fallback)
  ui: 'Inter_400Regular',
  uiBold: 'Inter_600SemiBold',
  // Numbers, rates, quantities — JetBrains Mono (monospace for alignment)
  mono: 'JetBrainsMono_400Regular',
} as const;

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
export type Spacing = typeof spacing;
export type Radius = typeof radius;
