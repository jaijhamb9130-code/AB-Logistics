import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { colors, spacing, typography } from '../constants/theme';
import { reportService } from '../services/reportService';
import type { ReportSummary } from '../../../shared/types/report';
import { canAccessTab } from '../navigation/guards';
import type { Role } from '../../../shared/types/user';

interface Props {
  visible: boolean;
  onClose: () => void;
  user: { username: string; role: string; permissions?: string[] } | null;
  logout: () => void;
  onNavigate?: (tab: string) => void;
}

const PANEL_WIDTH = 320;

export function ProfilePanel({ visible, onClose, user, logout, onNavigate }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  // On small screens use almost the full width, capped at 360 for tablet ergonomics.
  const panelWidth =
    screenWidth < 768 ? Math.min(360, screenWidth - 32) : PANEL_WIDTH;
  const slideAnim = useRef(new Animated.Value(panelWidth)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const s = await reportService.getSummary();
      setSummary(s);
    } catch {
      setSummary(null);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      loadStats();
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 14,
        }),
        Animated.timing(overlayAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: panelWidth,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(overlayAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => setMounted(false));
    }
  }, [visible, slideAnim, overlayAnim, loadStats, panelWidth]);

  if (!mounted) return null;

  const initials = (user?.username ?? 'AD').slice(0, 2).toUpperCase();
  const roleLabel = user?.role === 'admin' ? 'Administrator' : 'Staff';

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
      {/* Overlay */}
      <Animated.View
        style={[styles.overlay, { opacity: overlayAnim }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      </Animated.View>

      {/* Panel */}
      <Animated.View
        style={[
          styles.panel,
          { width: panelWidth, transform: [{ translateX: slideAnim }] },
        ]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.panelContent}
        >
          {/* Close button */}
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.5 }]}
            accessibilityRole="button"
            accessibilityLabel="Close profile"
          >
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>

          {/* Avatar + identity */}
          <View style={styles.identity}>
            <View style={styles.bigAvatar}>
              <Text style={styles.bigAvatarText}>{initials}</Text>
            </View>
            <Text style={styles.username}>{user?.username ?? '—'}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{roleLabel}</Text>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Stats — gated by tab permissions so staff only see what they can open */}
          {(() => {
            const guardUser = user
              ? { role: user.role as Role, permissions: user.permissions }
              : null;
            const canBilty = canAccessTab('Bilty', guardUser);
            const canFreight = canAccessTab('Freight', guardUser);
            const canLedgerGroups = canAccessTab('LedgerGroups', guardUser);
            const canUsers = canAccessTab('Users', guardUser);
            const anyVisible = canBilty || canFreight || canLedgerGroups || canUsers;
            if (!anyVisible) return null;
            return (
              <>
                <Text style={styles.sectionLabel}>YOUR ACTIVITY</Text>
                <View style={styles.statsGrid}>
                  {canBilty ? (
                    <StatCard
                      label="Bilties"
                      value={summary?.bilties ?? null}
                      loading={loadingStats}
                      accent="#FFCC3D"
                      onPress={onNavigate ? () => onNavigate('Bilty') : undefined}
                    />
                  ) : null}
                  {canFreight ? (
                    <StatCard
                      label="Freight Memos"
                      value={summary?.freight_memos ?? null}
                      loading={loadingStats}
                      accent="#F7483D"
                      onPress={onNavigate ? () => onNavigate('Freight') : undefined}
                    />
                  ) : null}
                  {canLedgerGroups ? (
                    <StatCard
                      label="Ledger Groups"
                      value={summary?.ledger_groups ?? null}
                      loading={loadingStats}
                      accent="#60A5FA"
                      onPress={onNavigate ? () => onNavigate('LedgerGroups') : undefined}
                    />
                  ) : null}
                  {canUsers && onNavigate ? (
                    <NavCard label="Users" accent="#8B5CF6" onPress={() => onNavigate('Users')} />
                  ) : null}
                </View>
              </>
            );
          })()}

          {/* Divider */}
          <View style={styles.divider} />

          {/* Logout */}
          <LogoutButton onPress={logout} />
        </ScrollView>
      </Animated.View>
    </View>
  );
}

function StatCard({
  label,
  value,
  loading,
  accent,
  onPress,
}: {
  label: string;
  value: number | null;
  loading: boolean;
  accent: string;
  onPress?: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 50 }).start();
  const onPressOut = () =>
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 30 }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPress ? onPressIn : undefined}
      onPressOut={onPress ? onPressOut : undefined}
      accessibilityRole={onPress ? 'button' : 'none'}
      style={{ cursor: onPress ? 'pointer' : 'default' } as any}
    >
      <Animated.View
        style={[styles.statCard, { transform: [{ scale: scaleAnim }] }]}
      >
        <View style={[styles.statAccentLine, { backgroundColor: accent }]} />
        <Text style={styles.statValue}>
          {loading ? '—' : value !== null ? String(value) : '—'}
        </Text>
        <Text style={styles.statLabel}>{label}</Text>
        {onPress ? <Text style={styles.statArrow}>→</Text> : null}
      </Animated.View>
    </Pressable>
  );
}

function NavCard({
  label,
  accent,
  onPress,
}: {
  label: string;
  accent: string;
  onPress: () => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 50 }).start();
  const onPressOut = () =>
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 30 }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      style={{ cursor: 'pointer' } as any}
    >
      <Animated.View
        style={[styles.statCard, { transform: [{ scale: scaleAnim }] }]}
      >
        <View style={[styles.statAccentLine, { backgroundColor: accent }]} />
        <Text style={[styles.statLabel, styles.navCardLabel]}>{label}</Text>
        <Text style={styles.statArrow}>→</Text>
      </Animated.View>
    </Pressable>
  );
}

function LogoutButton({ onPress }: { onPress: () => void }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const bgAnim = useRef(new Animated.Value(0)).current;

  const onPressIn = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true, speed: 50 }),
      Animated.timing(bgAnim, { toValue: 1, duration: 120, useNativeDriver: false }),
    ]).start();
  };
  const onPressOut = () => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, speed: 30 }),
      Animated.timing(bgAnim, { toValue: 0, duration: 200, useNativeDriver: false }),
    ]).start();
  };

  const bgColor = bgAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#F7483D', '#C0392B'],
  });

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityLabel="Logout"
    >
      <Animated.View
        style={[styles.logoutBtn, { backgroundColor: bgColor, transform: [{ scale: scaleAnim }] }]}
      >
        <Text style={styles.logoutBtnText}>LOGOUT</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: PANEL_WIDTH,
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 1,
    borderLeftColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: -6, height: 0 },
    elevation: 30,
  },
  panelContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 40,
  },

  closeBtn: {
    alignSelf: 'flex-end',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  closeBtnText: {
    color: '#64748B',
    fontSize: 14,
    fontFamily: typography.ui,
  },

  identity: {
    alignItems: 'center',
    marginBottom: 28,
  },
  bigAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.brandRed,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 3,
    borderColor: 'rgba(247,72,61,0.2)',
    shadowColor: colors.brandRed,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  bigAvatarText: {
    color: '#FFFFFF',
    fontFamily: typography.uiBold,
    fontSize: 26,
    letterSpacing: 1,
  },
  username: {
    color: '#0F172A',
    fontFamily: typography.uiBold,
    fontSize: 20,
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  roleBadge: {
    backgroundColor: colors.brandRedTone,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.brandRedBorder,
  },
  roleBadgeText: {
    color: colors.brandRed,
    fontFamily: typography.uiBold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 20,
  },

  sectionLabel: {
    color: '#94A3B8',
    fontFamily: typography.uiBold,
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 12,
  },

  statsGrid: {
    gap: 10,
  },
  statCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  statAccentLine: {
    width: 3,
    height: '100%',
    borderRadius: 2,
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  statValue: {
    color: '#0F172A',
    fontFamily: typography.uiBold,
    fontSize: 22,
    marginLeft: 14,
    marginRight: 12,
    letterSpacing: -0.5,
  },
  statLabel: {
    color: '#64748B',
    fontFamily: typography.ui,
    fontSize: 13,
    flex: 1,
  },
  navCardLabel: {
    marginLeft: 14,
    color: '#0F172A',
    fontFamily: typography.uiBold,
    fontSize: 14,
  },
  statArrow: {
    color: '#CBD5E1',
    fontSize: 16,
    fontFamily: typography.uiBold,
  },

  logoutBtn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutBtnText: {
    color: '#FFFFFF',
    fontFamily: typography.uiBold,
    fontSize: 13,
    letterSpacing: 2,
  },
});
