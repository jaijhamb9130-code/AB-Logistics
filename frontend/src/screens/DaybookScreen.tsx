/**
 * DaybookScreen — all vouchers on a given day with Dr/Cr split per row.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DataTable, type Column } from '../components/DataTable';
import { Loader } from '../components/Loader';
import { colors, radius, spacing, text, typography } from '../constants/theme';
import { voucherService } from '../services/voucherService';
import type { DaybookEntry } from '../../../shared/types/voucher';
import type { BillingStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<BillingStackParamList, 'Daybook'>;
type Route = RouteProp<BillingStackParamList, 'Daybook'>;

function fmtMoney(v: number | string): string {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n === 0) return '—';
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(iso: string, deltaDays: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export function DaybookScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const initialDate = route.params?.date || todayISO();
  const [date, setDate] = useState<string>(initialDate);
  const [rows, setRows] = useState<DaybookEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setRows(null);
    try {
      const data = await voucherService.daybook(date);
      setRows(data);
    } catch {
      setError('Could not load daybook.');
      setRows([]);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const totals = (rows || []).reduce(
    (acc, r) => ({
      dr: acc.dr + Number(r.dr_amount || 0),
      cr: acc.cr + Number(r.cr_amount || 0),
    }),
    { dr: 0, cr: 0 }
  );

  const columns: Column<DaybookEntry>[] = [
    {
      key: 'vch_type',
      label: 'Type',
      width: 110,
      render: (r) => <Text style={text.value} numberOfLines={1}>{r.vch_type_name || '—'}</Text>,
    },
    {
      key: 'vch_no',
      label: 'Voucher No',
      width: 120,
      render: (r) => <Text style={text.value}>{r.vch_no || '—'}</Text>,
    },
    {
      key: 'party_name',
      label: 'Party',
      render: (r) => <Text style={text.value} numberOfLines={1}>{r.party_name || '—'}</Text>,
    },
    {
      key: 'dr',
      label: 'Dr (₹)',
      width: 110,
      align: 'right',
      render: (r) => <Text style={[text.numeric, { color: colors.success }]}>{fmtMoney(r.dr_amount)}</Text>,
    },
    {
      key: 'cr',
      label: 'Cr (₹)',
      width: 110,
      align: 'right',
      render: (r) => <Text style={[text.numeric, { color: colors.brandRed }]}>{fmtMoney(r.cr_amount)}</Text>,
    },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.dateRow}>
        <Pressable style={styles.dateBtn} onPress={() => setDate(shiftDate(date, -1))}>
          <Text style={text.action}>‹</Text>
        </Pressable>
        <View style={styles.dateInputWrap}>
          <Text style={styles.dateLabel}>Date</Text>
          <TextInput
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textMuted}
            style={styles.dateInput}
          />
        </View>
        <Pressable style={styles.dateBtn} onPress={() => setDate(shiftDate(date, 1))}>
          <Text style={text.action}>›</Text>
        </Pressable>
        <Pressable style={styles.todayBtn} onPress={() => setDate(todayISO())}>
          <Text style={[text.action, { color: colors.text }]}>Today</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {rows === null ? (
        <Loader />
      ) : (
        <View style={styles.tableWrap}>
          <DataTable
            columns={columns}
            rows={rows}
            keyExtractor={(r) => r.id}
            onRowPress={(r) => navigation.navigate('VoucherForm', { id: r.id })}
            emptyLabel={`No vouchers on ${date}`}
            showSerialNo={false}
          />
          {rows.length > 0 ? (
            <View style={styles.totalsRow}>
              <Text style={[text.subheading, { color: colors.text }]}>Totals</Text>
              <View style={styles.totals}>
                <Text style={[text.numeric, { color: colors.success }]}>Dr ₹{fmtMoney(totals.dr)}</Text>
                <Text style={[text.numeric, { color: colors.brandRed }]}>Cr ₹{fmtMoney(totals.cr)}</Text>
              </View>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  tableWrap: { flex: 1, minHeight: 200 },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  dateBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  dateInputWrap: { flex: 1, maxWidth: 220 },
  dateLabel: {
    fontSize: 12,
    fontFamily: typography.uiBold,
    color: colors.textLabel,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  dateInput: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: typography.mono,
    color: colors.text,
  },
  todayBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  errorBanner: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { fontFamily: typography.uiBold, color: colors.danger, fontSize: 13 },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  totals: { flexDirection: 'row', gap: spacing.lg },
});
