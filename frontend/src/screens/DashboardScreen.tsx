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
import type { RecentBilty, ReportSummary } from '../../../shared/types/report';
import type { AppTabsParamList } from '../navigation/types';

type Nav = BottomTabNavigationProp<AppTabsParamList>;

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function fmtMoney(v: number | null | undefined): string {
  if (!v) return '₹0';
  return '₹' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function getTodayLabel(): string {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number | null;
  subtitle?: string;
  visible: boolean;
  accent: string;
  onPress?: () => void;
  testID?: string;
}

function StatCard({ label, value, subtitle, visible, accent, onPress, testID }: StatCardProps) {
  const display = visible && value !== null ? String(value) : '—';
  const scale = useRef(new Animated.Value(1)).current;
  const lift  = useRef(new Animated.Value(0)).current;
  const [hovered, setHovered] = useState(false);

  const animateActive = () => {
    setHovered(true);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1.02, useNativeDriver: true, speed: 40, bounciness: 4 }),
      Animated.spring(lift,  { toValue: -6,   useNativeDriver: true, speed: 40, bounciness: 4 }),
    ]).start();
  };
  const animateRest = () => {
    setHovered(false);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 4 }),
      Animated.spring(lift,  { toValue: 0, useNativeDriver: true, speed: 40, bounciness: 4 }),
    ]).start();
  };

  const shadowStyle = Platform.OS === 'web'
    ? ({
        transition: 'box-shadow 0.25s ease',
        boxShadow: hovered
          ? `0 14px 30px ${withAlpha(accent, 0.28)}, 0 4px 10px rgba(15,23,42,0.06)`
          : `0 3px 12px ${withAlpha(accent, 0.10)}, 0 1px 4px rgba(15,23,42,0.04)`,
      } as any)
    : {
        shadowColor: accent,
        shadowOpacity: hovered ? 0.30 : 0.10,
        shadowRadius: hovered ? 16 : 8,
        shadowOffset: { width: 0, height: hovered ? 8 : 3 },
        elevation: hovered ? 10 : 4,
      };

  const inner = (
    <Animated.View style={[
      styles.card,
      { backgroundColor: withAlpha(accent, 0.05) },
      shadowStyle,
      { transform: [{ scale }, { translateY: lift }] },
    ]}>
      <View style={[styles.cardAccent, { backgroundColor: accent }]} />
      <View style={styles.cardBody}>
        <Text style={[styles.cardLabel, { color: accent }]}>{label}</Text>
        <Text style={styles.cardValue} testID={testID}>{display}</Text>
        {subtitle && visible ? (
          <Text style={styles.cardSubtitle}>{subtitle}</Text>
        ) : null}
      </View>
    </Animated.View>
  );

  if (!onPress) return <View style={styles.cardSlot}>{inner}</View>;

  return (
    <View style={styles.cardSlot}>
      <Pressable
        onPress={onPress}
        onPressIn={animateActive}
        onPressOut={animateRest}
        onHoverIn={animateActive}
        onHoverOut={animateRest}
        accessibilityRole="button"
        style={Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined}
      >
        {inner}
      </Pressable>
    </View>
  );
}

// ── Recent bilties row ─────────────────────────────────────────────────────────

function RecentRow({ item, isLast, onPress }: { item: RecentBilty; isLast: boolean; onPress: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.recentRow,
        !isLast && styles.recentRowBorder,
        Platform.OS === 'web' && hovered && ({ backgroundColor: '#F8FAFC' } as any),
      ]}
    >
      <View style={styles.recentLeft}>
        <Text style={styles.recentBiltyNo}>{item.bilty_no}</Text>
        <Text style={styles.recentMeta} numberOfLines={1}>
          {item.consignor || '—'}{'  ·  '}{item.truck_no || '—'}
        </Text>
      </View>
      <View style={styles.recentRight}>
        <Text style={styles.recentAmount}>{fmtMoney(item.amount)}</Text>
        <Text style={styles.recentDate}>{fmtDate(item.bilty_date)}</Text>
      </View>
    </Pressable>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export function DashboardScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      setSummary(await reportService.getSummary());
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
  const recent = summary?.recent_bilties ?? [];

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content} testID="dashboard-scroll">

      {/* ── Greeting ── */}
      <View style={styles.header}>
        <Text style={styles.welcome}>
          {getGreeting()},{' '}
          <Text style={styles.welcomeName}>{user?.username ?? '—'}</Text>
        </Text>
        <Text style={styles.dateLabel}>{getTodayLabel()}</Text>
      </View>

      {error ? (
        <View style={styles.errorBanner} testID="dashboard-error">
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      {loading && summary === null ? <Loader /> : (
        <>
          {/* ── KPI cards ── */}
          <View style={styles.grid}>
            <StatCard
              label="Today's Bilties"
              value={summary?.today_bilties ?? 0}
              subtitle={fmtMoney(summary?.today_freight)}
              visible={perms.bilty}
              accent={colors.brandRed}
              onPress={() => navigation.navigate('Bilty')}
              testID="stat-today-bilties"
            />
            <StatCard
              label="This Month"
              value={summary?.month_bilties ?? 0}
              subtitle={fmtMoney(summary?.month_freight)}
              visible={perms.bilty}
              accent="#10B981"
              onPress={() => navigation.navigate('Bilty')}
              testID="stat-month-bilties"
            />
            <StatCard
              label="All Bilties"
              value={summary?.bilties ?? 0}
              visible={perms.bilty}
              accent="#6366F1"
              onPress={() => navigation.navigate('Bilty')}
              testID="stat-bilties"
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

          {/* ── Recent Bilties ── */}
          {perms.bilty && recent.length > 0 ? (
            <View style={styles.recentSection}>
              <Text style={styles.sectionTitle}>RECENT BILTIES</Text>
              <View style={styles.recentCard}>
                {recent.map((b, i) => (
                  <RecentRow
                    key={b.id}
                    item={b}
                    isLast={i === recent.length - 1}
                    onPress={() => navigation.navigate('Bilty')}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </>
      )}

    </ScrollView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrap:    { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl },

  // Header
  header:      { marginBottom: spacing.xl },
  welcome:     { ...text.heading, fontSize: 24, lineHeight: 32, marginBottom: 4 },
  welcomeName: { color: colors.brandRed },
  dateLabel:   { ...text.value, color: colors.textMuted, fontSize: 13 },

  // Error
  errorBanner: {
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.danger,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorBannerText: { ...text.label, color: colors.danger },

  // Grid
  grid:     { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.sm, marginBottom: spacing.xl },
  cardSlot: { width: '50%', padding: spacing.sm },

  // Card
  card: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.04)',
  },
  cardAccent: { width: 7, borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  cardBody:   { flex: 1, paddingHorizontal: spacing.lg, paddingVertical: spacing.md + 2 },
  cardLabel: {
    fontSize: 11,
    fontFamily: typography.uiBold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 6,
    opacity: 0.85,
  },
  cardValue: {
    color: colors.textStrong,
    fontSize: 30,
    fontFamily: typography.mono,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  cardSubtitle: {
    marginTop: 3,
    fontSize: 13,
    fontFamily: typography.uiMedium,
    color: colors.textMuted,
  },

  // Recent bilties
  recentSection: { marginBottom: spacing.xl },
  sectionTitle: {
    fontSize: 11,
    fontFamily: typography.uiBold,
    color: colors.textLabel,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  recentCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { boxShadow: '0 2px 8px rgba(15,23,42,0.05)' } as any : {
      shadowColor: '#0F172A', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    }),
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  recentRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  recentLeft:  { flex: 1, marginRight: 12 },
  recentRight: { alignItems: 'flex-end' },
  recentBiltyNo: {
    fontFamily: typography.uiBold,
    fontSize: 14,
    color: colors.textStrong,
    marginBottom: 2,
  },
  recentMeta: {
    fontFamily: typography.ui,
    fontSize: 12,
    color: colors.textMuted,
  },
  recentAmount: {
    fontFamily: typography.uiBold,
    fontSize: 14,
    color: '#10B981',
    marginBottom: 2,
  },
  recentDate: {
    fontFamily: typography.ui,
    fontSize: 12,
    color: colors.textMuted,
  },
});
