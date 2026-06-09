/**
 * Tiny zero-dependency icon set using inline SVG (web) / View primitives (native).
 * Add icons here as the app grows — keep each one under ~20 lines.
 */
import React from 'react';
import { Platform, View } from 'react-native';

type IconProps = { size?: number; color?: string; strokeWidth?: number };

function SvgIcon({ size = 16, children, viewBox = '0 0 24 24', color = '#6B7280', strokeWidth = 2 }: IconProps & { children: any; viewBox?: string }) {
  if (Platform.OS !== 'web') return null;
  return React.createElement('svg', {
    width: size, height: size, viewBox,
    fill: 'none', stroke: color,
    strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round',
    style: { display: 'block', flexShrink: 0 },
  }, children);
}

export function SearchIcon({ size = 16, color = '#6B7280' }: IconProps) {
  return (
    <SvgIcon size={size} color={color}>
      {[
        React.createElement('circle', { key: 'c', cx: 11, cy: 11, r: 8 }),
        React.createElement('path', { key: 'p', d: 'M21 21l-4.35-4.35' }),
      ]}
    </SvgIcon>
  );
}

export function XIcon({ size = 14, color = '#6B7280' }: IconProps) {
  return (
    <SvgIcon size={size} color={color}>
      {[
        React.createElement('line', { key: 'a', x1: 18, y1: 6, x2: 6, y2: 18 }),
        React.createElement('line', { key: 'b', x1: 6, y1: 6, x2: 18, y2: 18 }),
      ]}
    </SvgIcon>
  );
}

export function ChevronDownIcon({ size = 14, color = '#6B7280' }: IconProps) {
  return (
    <SvgIcon size={size} color={color}>
      {React.createElement('polyline', { points: '6 9 12 15 18 9' })}
    </SvgIcon>
  );
}

export function ArrowLeftIcon({ size = 14, color = '#6B7280' }: IconProps) {
  return (
    <SvgIcon size={size} color={color}>
      {[
        React.createElement('line', { key: 'a', x1: 19, y1: 12, x2: 5, y2: 12 }),
        React.createElement('polyline', { key: 'b', points: '12 19 5 12 12 5' }),
      ]}
    </SvgIcon>
  );
}

export function CalendarIcon({ size = 14, color = '#6B7280' }: IconProps) {
  return (
    <SvgIcon size={size} color={color}>
      {[
        React.createElement('rect', { key: 'r', x: 3, y: 4, width: 18, height: 18, rx: 2, ry: 2 }),
        React.createElement('line', { key: 'a', x1: 16, y1: 2, x2: 16, y2: 6 }),
        React.createElement('line', { key: 'b', x1: 8, y1: 2, x2: 8, y2: 6 }),
        React.createElement('line', { key: 'c', x1: 3, y1: 10, x2: 21, y2: 10 }),
      ]}
    </SvgIcon>
  );
}

export function RefreshIcon({ size = 14, color = '#6B7280' }: IconProps) {
  return (
    <SvgIcon size={size} color={color}>
      {[
        React.createElement('polyline', { key: 'a', points: '23 4 23 10 17 10' }),
        React.createElement('path', { key: 'b', d: 'M20.49 15a9 9 0 1 1-2.12-9.36L23 10' }),
      ]}
    </SvgIcon>
  );
}
