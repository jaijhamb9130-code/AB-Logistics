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
  ScrollView, StyleSheet, Text, View,
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
  testID?: string;
}

function StatCard({ label, value, visible, testID }: StatCardProps) {
  const display = visible && value !== null ? String(value) : '—';
  return (
    <View style={styles.cardSlot}>
      <View style={styles.card}>
        <View style={styles.cardBody}>
          <Text style={styles.cardLabel}>{label}</Text>
          <Text style={styles.cardValue} testID={testID}>{display}</Text>
        </View>
      </View>
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
            testID="stat-bilties"
          />
          <StatCard
            label="Freight Memos"
            value={summary?.freight_memos ?? 0}
            visible={perms.freight}
            testID="stat-freight"
          />
          <StatCard
            label="Orders"
            value={summary?.orders ?? 0}
            visible={perms.order}
            testID="stat-orders"
          />
          <StatCard
            label="Vehicles"
            value={summary?.vehicles ?? 0}
            visible={perms.vehicle}
            testID="stat-vehicles"
          />
          <StatCard
            label="Active Users"
            value={summary?.active_users ?? 0}
            visible={perms.report}
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
    minHeight: 80,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  cardBody: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  cardLabel: {
    ...text.label,
    fontSize: 13,
    color: colors.textLabel,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  cardValue: {
    color: colors.textStrong,
    fontSize: 32,
    fontFamily: typography.mono,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
});
