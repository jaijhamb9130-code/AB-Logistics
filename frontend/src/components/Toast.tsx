/**
 * Toast — lightweight auto-dismissing success/info banner.
 *
 * Pass a `message` to show it; it calls `onDone` after `duration` ms so the
 * parent can clear its state. Renders nothing when `message` is null/empty.
 *
 * On web it renders through a body-level portal (fixed, top-centre) so it can
 * never be clipped by a parent's overflow/transform/stacking context — the
 * same reason the dropdowns portal out. On native it's an absolute overlay.
 */
import React, { useEffect } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../constants/theme';

const ReactDOM: any = Platform.OS === 'web' ? require('react-dom') : null;

interface Props {
  message: string | null;
  onDone: () => void;
  duration?: number;
  variant?: 'success' | 'error';
}

export function Toast({ message, onDone, duration = 2800, variant = 'success' }: Props) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, duration);
    return () => clearTimeout(t);
    // onDone is intentionally omitted — parents pass an inline closure, so
    // including it would reset the timer on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, duration]);

  if (!message) return null;

  const bg = variant === 'error' ? colors.danger : colors.success;
  const icon = variant === 'error' ? '✕' : '✓';

  // ── Web: body-level portal so nothing can clip or hide it.
  if (Platform.OS === 'web' && ReactDOM) {
    return ReactDOM.createPortal(
      <div
        style={{
          position: 'fixed',
          top: 16,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          zIndex: 2147483647,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: bg,
            color: '#FFFFFF',
            padding: '10px 18px',
            borderRadius: radius.lg,
            fontFamily: typography.uiBold,
            fontSize: 14,
            boxShadow: '0 8px 24px rgba(15,23,42,0.22)',
          }}
        >
          <span>{icon}</span>
          <span>{message}</span>
        </div>
      </div>,
      document.body,
    );
  }

  // ── Native: absolute overlay near the top.
  return (
    <View pointerEvents="none" style={styles.host}>
      <View style={[styles.pill, { backgroundColor: bg }]}>
        <Text style={styles.icon}>{icon}</Text>
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: spacing.md,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000000,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.lg,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  icon: { color: '#FFFFFF', fontSize: 14, fontFamily: typography.uiBold },
  text: { color: '#FFFFFF', fontSize: 14, fontFamily: typography.uiBold },
});
