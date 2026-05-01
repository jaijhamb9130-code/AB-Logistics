/**
 * ReportsScreen — shows the last 20 bilties for users with `bilty.read`.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { DataTable, type Column } from '../components/DataTable';
import { Loader } from '../components/Loader';
import { colors, radius, spacing, typography } from '../constants/theme';
import { reportService } from '../services/reportService';
import type { ReportHistory } from '../../../shared/types/report';
import type { BiltyListItem } from '../../../shared/types/bilty';

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

export function ReportsScreen() {
  const [history, setHistory] = useState<ReportHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const h = await reportService.getHistory();
      setHistory(h);
    } catch {
      setError('Could not load reports. Try again.');
      setHistory(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const canRead = history?.permissions?.bilty ?? false;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Bilty History</Text>

      {error ? (
        <View style={styles.errorBanner} testID="reports-error">
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      {loading && history === null ? (
        <Loader />
      ) : !canRead ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            You don't have permission to view bilty history.
          </Text>
        </View>
      ) : (
        <View style={styles.tableWrap}>
          <DataTable<BiltyListItem>
            columns={biltyColumns}
            rows={history?.bilties ?? []}
            keyExtractor={(r) => r.id}
            emptyLabel="No bilties yet."
            testID="reports-bilty-table"
          />
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
});
