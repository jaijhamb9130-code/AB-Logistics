/**
 * BiltyScreen — list of bilties + "New Bilty" entry (Phase 3).
 *
 * Reuses DataTable with 7 columns: Bilty No, Date, Consignor, Truck No,
 * Items, Created, Actions (View). "New Bilty" ButtonPrimary navigates to
 * BiltyForm. Row tap also navigates to BiltyDetail.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ButtonPrimary } from '../components/ButtonPrimary';
import { DataTable, type Column } from '../components/DataTable';
import { Loader } from '../components/Loader';
import { colors, radius, spacing, text } from '../constants/theme';
import { biltyService } from '../services/biltyService';
import type { BiltyListItem } from '../../../shared/types/bilty';
import type { BiltyStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<BiltyStackParamList, 'BiltyList'>;

export function BiltyScreen() {
  const navigation = useNavigation<Nav>();
  const [rows, setRows] = useState<BiltyListItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const list = await biltyService.list();
      setRows(list);
    } catch (_e) {
      setErr('Could not load bilties. Try again.');
      setRows([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refresh on focus so a just-created bilty shows up when user returns.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const columns: Column<BiltyListItem>[] = [
    { key: 'bilty_no', label: 'Bilty No', width: 160, render: (r) => r.bilty_no },
    { key: 'bilty_date', label: 'Date', width: 120, render: (r) => formatDate(r.bilty_date) },
    { key: 'consignor', label: 'Consignor', render: (r) => r.consignor },
    { key: 'truck_no', label: 'Truck No', width: 140, render: (r) => r.truck_no },
    { key: 'item_count', label: 'Items', width: 80, align: 'right', render: (r) => String(r.item_count ?? 0) },
    { key: 'created_at', label: 'Created', width: 180, render: (r) => formatDateTime(r.created_at) },
    {
      key: 'actions',
      label: '',
      width: 90,
      align: 'right',
      render: (r) => (
        <Pressable
          onPress={() => navigation.navigate('BiltyDetail', { id: r.id })}
          accessibilityRole="button"
          accessibilityLabel={`View ${r.bilty_no}`}
          testID={`view-${r.id}`}
        >
          <Text style={styles.viewAction}>View</Text>
        </Pressable>
      ),
    },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Bilty</Text>
        <View style={styles.headerBtn}>
          <ButtonPrimary
            title="New Bilty"
            onPress={() => navigation.navigate('BiltyForm')}
            testID="new-bilty-btn"
          />
        </View>
      </View>

      {err ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{err}</Text>
        </View>
      ) : null}

      {rows === null ? (
        <Loader />
      ) : (
        <View style={styles.tableWrap}>
          <DataTable<BiltyListItem>
            columns={columns}
            rows={rows}
            keyExtractor={(r) => r.id}
            onRowPress={(r) => navigation.navigate('BiltyDetail', { id: r.id })}
            emptyLabel="No bilties yet — click New Bilty to create one."
            testID="bilty-table"
          />
        </View>
      )}
    </View>
  );
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

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toISOString().slice(0, 19).replace('T', ' ');
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: { ...text.heading, fontSize: 22, lineHeight: 28 },
  headerBtn: { minWidth: 140 },
  tableWrap: { flex: 1, minHeight: 200 },
  errorBanner: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorBannerText: {
    ...text.label,
    color: colors.danger,
  },
  viewAction: {
    ...text.action,
    color: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
});
