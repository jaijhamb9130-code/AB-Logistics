/**
 * ReportsScreen — Phase 6 (REPORT-03).
 *
 * Tabbed history view with Bilty History (last 20) and Order History (last 20).
 * Tabs are gated by permissions returned by the backend — a user without
 * `bilty.read` won't see the Bilty tab, etc. Admin sees both.
 *
 * Reuses DataTable for Tally-dense tables.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet, Text, View,
} from 'react-native';
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import { DataTable, type Column } from '../components/DataTable';
import { Loader } from '../components/Loader';
import { colors, radius, spacing, typography } from '../constants/theme';
import { reportService } from '../services/reportService';
import type { ReportHistory } from '../../../shared/types/report';
import type { BiltyListItem } from '../../../shared/types/bilty';
import type { OrderListItem, OrderStatus } from '../../../shared/types/order';
import type { AppTabsParamList } from '../navigation/types';

type TabKey = 'bilty' | 'order';

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
};

function statusStyles(status: OrderStatus) {
  if (status === 'completed') return { bg: 'rgba(34,197,94,0.12)', fg: colors.success };
  if (status === 'in_progress') return { bg: colors.brandYellowTone, fg: colors.brandBlack };
  return { bg: 'rgba(100,116,139,0.12)', fg: colors.textMuted };
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
    return d.toISOString().slice(0, 10);
  } catch {
    return String(iso).slice(0, 10);
  }
}

const biltyColumns: Column<BiltyListItem>[] = [
  { key: 'bilty_no', label: 'Bilty No', width: 160, render: (r) => r.bilty_no },
  { key: 'bilty_date', label: 'Date', width: 110, render: (r) => formatDate(r.bilty_date) },
  { key: 'consignor', label: 'Consignor', render: (r) => r.consignor },
  { key: 'truck_no', label: 'Truck', width: 120, render: (r) => r.truck_no },
  {
    key: 'item_count', label: 'Items', width: 80, align: 'right',
    render: (r) => String(r.item_count ?? 0),
  },
];

const orderColumns: Column<OrderListItem>[] = [
  { key: 'order_no', label: 'Order No', width: 160, render: (r) => r.order_no },
  { key: 'order_date', label: 'Date', width: 110, render: (r) => formatDate(r.order_date) },
  { key: 'customer_name', label: 'Customer', render: (r) => r.customer_name },
  {
    key: 'route', label: 'Route', width: 180,
    render: (r) => `${r.from_loc ?? '—'} → ${r.to_loc ?? '—'}`,
  },
  {
    key: 'status', label: 'Status', width: 130,
    render: (r) => {
      const s = statusStyles(r.status);
      return (
        <View style={[styles.pill, { backgroundColor: s.bg }]}>
          <Text style={[styles.pillText, { color: s.fg }]}>{STATUS_LABELS[r.status]}</Text>
        </View>
      );
    },
  },
  { key: 'vehicle_no', label: 'Vehicle', width: 140, render: (r) => r.vehicle_no || '—' },
];

export function ReportsScreen() {
  const route = useRoute<RouteProp<AppTabsParamList, 'Reports'>>();
  const paramSection = route.params?.section;
  const [history, setHistory] = useState<ReportHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [tab, setTab] = useState<TabKey>(paramSection ?? 'bilty');

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const h = await reportService.getHistory();
      setHistory(h);
      if (paramSection && h.permissions[paramSection]) {
        setTab(paramSection);
      } else if (h.permissions.bilty) {
        setTab('bilty');
      } else if (h.permissions.order) {
        setTab('order');
      }
    } catch {
      setError('Could not load reports. Try again.');
      setHistory(null);
    } finally {
      setLoading(false);
    }
  }, [paramSection]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (paramSection && history?.permissions?.[paramSection]) {
      setTab(paramSection);
    }
  }, [paramSection, history]);

  const perms = history?.permissions ?? { bilty: false, order: false };
  const showBilty = perms.bilty;
  const showOrder = perms.order;
  const activeTab: TabKey = showBilty && !showOrder
    ? 'bilty'
    : showOrder && !showBilty
      ? 'order'
      : tab;

  const pageTitle = activeTab === 'order' ? 'Order History' : 'Bilty History';

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{pageTitle}</Text>

      {error ? (
        <View style={styles.errorBanner} testID="reports-error">
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      {loading && history === null ? (
        <Loader />
      ) : !showBilty && !showOrder ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            You don't have permission to view any history.
          </Text>
        </View>
      ) : (
        <View style={styles.tableWrap}>
          {activeTab === 'bilty' && showBilty ? (
            <DataTable<BiltyListItem>
              columns={biltyColumns}
              rows={history?.bilties ?? []}
              keyExtractor={(r) => r.id}
              emptyLabel="No bilties yet."
              testID="reports-bilty-table"
            />
          ) : null}
          {activeTab === 'order' && showOrder ? (
            <DataTable<OrderListItem>
              columns={orderColumns}
              rows={history?.orders ?? []}
              keyExtractor={(r) => r.id}
              emptyLabel="No orders yet."
              testID="reports-order-table"
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  title: { fontSize: 24, lineHeight: 32, color: colors.text, fontFamily: typography.uiBold, marginBottom: spacing.lg },
  errorBanner: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  errorBannerText: { color: colors.danger, fontFamily: typography.ui, fontSize: 14, lineHeight: 20 },
  tableWrap: { flex: 1, minHeight: 200 },
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyText: { color: colors.textMuted, fontFamily: typography.ui, fontSize: 14 },
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: 13, lineHeight: 18, fontFamily: typography.uiBold },
});
