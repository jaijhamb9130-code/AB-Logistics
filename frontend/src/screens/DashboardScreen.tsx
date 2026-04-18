/**
 * DashboardScreen — Phase 6 (REPORT-01, REPORT-02).
 *
 * Role-based summary dashboard:
 *  - Welcome header (username + role)
 *  - Stat cards grid: Bilties / Freight Memos / Orders / Vehicles / Active Users
 *  - Cards the current user lacks permission for render "—" (admin sees all)
 *  - Loading + error states
 *
 * Permission mapping mirrors backend reportsController:
 *  - bilty.read    → Bilties card
 *  - bilty.read    → Freight Memos card (Phase 4 convention; explicit freight.read
 *                    also grants this server-side)
 *  - order.read    → Orders card
 *  - vehicle.read  → Vehicles card
 *  - report.read   → Active Users card (admin passes regardless)
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Button, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Loader } from '../components/Loader';
import { useAuth } from '../context/AuthContext';
import { colors, radius, spacing, text, typography } from '../constants/theme';
import { reportService } from '../services/reportService';
import type { ReportSummary } from '../../../shared/types/report';

interface StatCardProps {
  label: string;
  value: number | null;
  visible: boolean;
  accent: string;
  testID?: string;
}

function StatCard({ label, value, visible, accent, testID }: StatCardProps) {
  const display = visible && value !== null ? String(value) : '—';
  return (
    <View style={styles.cardSlot}>
      <View style={styles.card}>
        <View style={[styles.cardAccent, { backgroundColor: accent }]} />
        <View style={styles.cardBody}>
          <Text style={styles.cardLabel}>{label}</Text>
          <Text style={styles.cardValue} testID={testID}>{display}</Text>
        </View>
      </View>
    </View>
  );
}

export function DashboardScreen() {
  const { user, logout } = useAuth();
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
    bilty: false, freight: false, order: false, vehicle: false, report: false,
  };

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={styles.content}
      testID="dashboard-scroll"
    >
      <View style={styles.header}>
        <Text style={styles.welcome}>
          Welcome, <Text style={styles.welcomeBold}>{user?.username ?? '—'}</Text>
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
            accent={colors.brandYellow}
            testID="stat-bilties"
          />
          <StatCard
            label="Freight Memos"
            value={summary?.freight_memos ?? 0}
            visible={perms.freight}
            accent={colors.brandRed}
            testID="stat-freight"
          />
          <StatCard
            label="Orders"
            value={summary?.orders ?? 0}
            visible={perms.order}
            accent={colors.brandBlack}
            testID="stat-orders"
          />
          <StatCard
            label="Vehicles"
            value={summary?.vehicles ?? 0}
            visible={perms.vehicle}
            accent={colors.brandRed}
            testID="stat-vehicles"
          />
          <StatCard
            label="Active Users"
            value={summary?.active_users ?? 0}
            visible={perms.report}
            accent={colors.brandYellow}
            testID="stat-users"
          />
        </View>
      )}

      <View style={styles.logoutRow}>
        <Button title="Logout" color={colors.danger} onPress={logout} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.xl },
  welcome: {
    ...text.heading,
    fontSize: 22,
    lineHeight: 28,
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
    minHeight: 120,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardAccent: {
    width: 5,
  },
  cardBody: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  cardLabel: {
    ...text.label,
    fontSize: 12,
    color: colors.textLabel,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  cardValue: {
    color: colors.textStrong,
    fontSize: 36,
    fontFamily: typography.mono,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  logoutRow: {
    marginTop: spacing.lg,
    alignSelf: 'flex-start',
    minWidth: 160,
  },
});
