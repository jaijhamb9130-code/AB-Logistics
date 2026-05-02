/**
 * DaybookScreen — all vouchers on a given day with Dr/Cr split per row.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
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
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDate(iso: string, delta: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function DaybookScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const initialDate = route.params?.date || todayISO();
  const [date, setDate] = useState<string>(initialDate);
  const [rows, setRows] = useState<DaybookEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ref to the real <input type="date"> DOM element so we can call showPicker().
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setError(null);
    setRows(null);
    voucherService.daybook(date)
      .then(setRows)
      .catch(() => { setError('Could not load daybook.'); setRows([]); });
  }, [date]);

  const totals = (rows || []).reduce(
    (acc, r) => ({ dr: acc.dr + Number(r.dr_amount || 0), cr: acc.cr + Number(r.cr_amount || 0) }),
    { dr: 0, cr: 0 }
  );

  const columns: Column<DaybookEntry>[] = [
    { key: 'vch_type', label: 'Type', width: 110, render: (r) => <Text style={text.value} numberOfLines={1}>{r.vch_type_name || '—'}</Text> },
    { key: 'vch_no', label: 'Voucher No', width: 120, render: (r) => <Text style={text.value}>{r.vch_no || '—'}</Text> },
    { key: 'party_name', label: 'Party', render: (r) => <Text style={text.value} numberOfLines={1}>{r.party_name || '—'}</Text> },
    { key: 'dr', label: 'Dr (₹)', width: 110, align: 'right', render: (r) => <Text style={[text.numeric, { color: colors.success }]}>{fmtMoney(r.dr_amount)}</Text> },
    { key: 'cr', label: 'Cr (₹)', width: 110, align: 'right', render: (r) => <Text style={[text.numeric, { color: colors.brandRed }]}>{fmtMoney(r.cr_amount)}</Text> },
  ];

  // ─── Web date bar — pure HTML so every click goes straight to the DOM ──────
  const WebDateBar = () => (
    <div style={{ display: 'flex', flexDirection: 'row' as const, alignItems: 'flex-end', gap: 8, marginBottom: 24 }}>
      {/* Left arrow — always visible, moves date one day back */}
      <button
        type="button"
        aria-label="Previous day"
        onClick={() => setDate((d) => shiftDate(d, -1))}
        style={{
          width: 40, height: 40, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid #CBD5E1', borderRadius: 10,
          backgroundColor: '#FFFFFF', color: '#0F172A',
          fontSize: 20, cursor: 'pointer', padding: 0,
          fontFamily: 'inherit',
        }}
      >‹</button>

      {/* Date input wrapper */}
      <div style={{ display: 'flex', flexDirection: 'column' as const, width: 200 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B', marginBottom: 4, letterSpacing: 0.2 }}>
          Date
        </span>
        <input
          ref={(el) => { dateInputRef.current = el; }}
          type="date"
          value={date}
          onChange={(e) => { if (e.target.value) setDate(e.target.value); }}
          style={{
            width: '100%', height: 40, boxSizing: 'border-box' as const,
            padding: '0 12px', fontSize: 14, fontFamily: 'monospace',
            color: '#0F172A', backgroundColor: '#FFFFFF',
            border: '1px solid #CBD5E1', borderRadius: 10,
            outline: 'none', cursor: 'pointer',
          }}
        />
      </div>

      {/* Right arrow — only shown when viewing a past date */}
      {date < todayISO() ? (
        <button
          type="button"
          aria-label="Next day"
          onClick={() => setDate((d) => shiftDate(d, 1))}
          style={{
            width: 40, height: 40, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid #CBD5E1', borderRadius: 10,
            backgroundColor: '#FFFFFF', color: '#0F172A',
            fontSize: 20, cursor: 'pointer', padding: 0,
            fontFamily: 'inherit',
          }}
        >›</button>
      ) : null}
    </div>
  );

  return (
    <View style={styles.wrap}>
      {Platform.OS === 'web' ? <WebDateBar /> : null}

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
  errorBanner: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  errorText: { fontFamily: typography.uiBold, color: colors.danger, fontSize: 13 },
  totalsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  totals: { flexDirection: 'row', gap: spacing.lg },
});
