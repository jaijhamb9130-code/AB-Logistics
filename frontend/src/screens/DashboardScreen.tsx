/**
 * DashboardScreen — admin-only summary with warm, tactile stat cards.
 *
 * Each card has:
 *   - Subtle accent-tinted background (warm, not flat white)
 *   - Wider accent stripe with rounded inner edge
 *   - On hover/press: lifts up, gains a colored glow shadow matching accent
 *   - Smooth spring animation with low bounciness for a "weighted" feel
 *   - Click → navigates to the corresponding tab
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Loader } from '../components/Loader';
import { useAuth } from '../context/AuthContext';
import { colors, radius, spacing, text, typography } from '../constants/theme';
import { reportService } from '../services/reportService';
import type { ReportSummary } from '../../../shared/types/report';
import type { AppTabsParamList } from '../navigation/types';

type Nav = BottomTabNavigationProp<AppTabsParamList>;

// Convert "#RRGGBB" → "rgba(r,g,b,alpha)" — used to derive tinted backgrounds
// and colored shadow glows from a single accent hex.
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface StatCardProps {
  label: string;
  value: number | null;
  visible: boolean;
  accent: string;
  onPress?: () => void;
  testID?: string;
}

function StatCard({ label, value, visible, accent, onPress, testID }: StatCardProps) {
  const display = visible && value !== null ? String(value) : '—';

  const scale = useRef(new Animated.Value(1)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const [hovered, setHovered] = useState(false);

  const animateActive = () => {
    setHovered(true);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1.02, useNativeDriver: true, speed: 40, bounciness: 4 }),
      Animated.spring(lift, { toValue: -8, useNativeDriver: true, speed: 40, bounciness: 4 }),
    ]).start();
  };
  const animateRest = () => {
    setHovered(false);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 4 }),
      Animated.spring(lift, { toValue: 0, useNativeDriver: true, speed: 40, bounciness: 4 }),
    ]).start();
  };

  // Subtle tinted background, plus a colored glow shadow that intensifies on
  // hover. On native, fall back to a regular shadow.
  const dynamicCardStyle = [
    { backgroundColor: withAlpha(accent, 0.05) },
    Platform.OS === 'web'
      ? ({
          transition: 'box-shadow 0.25s ease',
          boxShadow: hovered
            ? `0 16px 36px ${withAlpha(accent, 0.32)}, 0 4px 10px rgba(15,23,42,0.06)`
            : `0 4px 14px ${withAlpha(accent, 0.10)}, 0 1px 4px rgba(15,23,42,0.05)`,
        } as any)
      : {
          shadowColor: accent,
          shadowOpacity: hovered ? 0.35 : 0.12,
          shadowRadius: hovered ? 18 : 10,
          shadowOffset: { width: 0, height: hovered ? 10 : 4 },
          elevation: hovered ? 12 : 5,
        },
  ];

  const cardInner = (
    <Animated.View
      style={[
        styles.card,
        ...dynamicCardStyle,
        { transform: [{ scale }, { translateY: lift }] },
      ]}
    >
      <View style={[styles.cardAccent, { backgroundColor: accent }]} />
      <View style={styles.cardBody}>
        <Text style={[styles.cardLabel, { color: accent }]}>{label}</Text>
        <Text style={styles.cardValue} testID={testID}>{display}</Text>
      </View>
    </Animated.View>
  );

  if (!onPress) {
    return <View style={styles.cardSlot}>{cardInner}</View>;
  }

  return (
    <View style={styles.cardSlot}>
      <Pressable
        onPress={onPress}
        onPressIn={animateActive}
        onPressOut={animateRest}
        onHoverIn={animateActive}
        onHoverOut={animateRest}
        accessibilityRole="button"
        accessibilityLabel={`Open ${label}`}
        style={Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined}
      >
        {cardInner}
      </Pressable>
    </View>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export function DashboardScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const s = await reportService.getSummary();
      setSummary(s);
    } catch {
      setError('Could not load dashboard. Try again.');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const perms = summary?.permissions ?? {
    bilty: false, freight: false, daybook: false, ledgergroup: false, user: false,
  };

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={styles.content}
      testID="dashboard-scroll"
    >
      <View style={styles.header}>
        <Text style={styles.welcome}>
          {getGreeting()},{' '}
          <Text style={styles.welcomeBold}>{user?.username ?? '—'}</Text>
        </Text>
        <Text style={styles.roleLine}>
          Role: <Text style={styles.roleBold}>{user?.role ?? '—'}</Text>
        </Text>
      </View>

      {error ? (
        <View style={styles.errorBanner} testID="dashboard-error">
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      {loading && summary === null ? (
        <Loader />
      ) : (
        <View style={styles.grid}>
          <StatCard
            label="Bilties"
            value={summary?.bilties ?? 0}
            visible={perms.bilty}
            accent={colors.brandRed}
            onPress={() => navigation.navigate('Bilty')}
            testID="stat-bilties"
          />
          <StatCard
            label="Daybook"
            value={summary?.bilties ?? 0}
            visible={perms.daybook}
            accent={colors.brandYellow}
            onPress={() =>
              (navigation as any).navigate('Billing', { screen: 'Daybook' })
            }
            testID="stat-daybook"
          />
          <StatCard
            label="Ledger Groups"
            value={summary?.ledger_groups ?? 0}
            visible={perms.ledgergroup}
            accent={colors.brandYellow}
            onPress={() => navigation.navigate('LedgerGroups')}
            testID="stat-ledger-groups"
          />
          <StatCard
            label="Active Users"
            value={summary?.active_users ?? 0}
            visible={perms.user}
            accent="#3B82F6"
            onPress={() => navigation.navigate('Users')}
            testID="stat-users"
          />
        </View>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.xl },
  welcome: {
    ...text.heading,
    fontSize: 26,
    lineHeight: 34,
    marginBottom: spacing.xs,
  },
  welcomeBold: { color: colors.brandRed },
  roleLine: { ...text.value, color: colors.textMuted },
  roleBold: { ...text.valueStrong, color: colors.text },
  errorBanner: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorBannerText: { ...text.label, color: colors.danger },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.sm,
    marginBottom: spacing.xl,
  },
  cardSlot: {
    width: '50%',
    padding: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    minHeight: 104,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.04)',
  },
  cardAccent: {
    width: 8,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  cardBody: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    justifyContent: 'center',
  },
  cardLabel: {
    fontSize: 12,
    fontFamily: typography.uiBold,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: 8,
    opacity: 0.85,
  },
  cardValue: {
    color: colors.textStrong,
    fontSize: 32,
    fontFamily: typography.mono,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
});
