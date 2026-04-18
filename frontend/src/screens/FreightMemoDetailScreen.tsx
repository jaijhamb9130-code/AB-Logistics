/**
 * FreightMemoDetailScreen — read-only A4 ledger view (Phase 4).
 *
 * Layout (FREIGHT-04, FREIGHT-05, FREIGHT-06):
 *   • Company header ("AB LOGISTICS") + memo_no + memo_date
 *   • Bilty reference block (bilty_no, consignor, truck_no, date)
 *   • Ledger table: Debit (items qty × rate) | Credit (advances + fuels)
 *   • Totals row + highlighted Net Payable
 *
 * No edit controls anywhere. The only action is Print (web only, Ctrl+P via
 * window.print()) and Back.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Loader } from '../components/Loader';
import { colors, radius, spacing, typography } from '../constants/theme';
import { freightService } from '../services/freightService';
import { toNum } from '../utils/biltyValidation';
import type { FreightMemoDetail } from '../../../shared/types/freight';
import type { FreightStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<FreightStackParamList, 'FreightDetail'>;
type Rt = RouteProp<FreightStackParamList, 'FreightDetail'>;

const COMPANY_NAME = 'AB LOGISTICS';
const COMPANY_TAGLINE = 'Freight Memo';

export function FreightMemoDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { id } = route.params;
  const [data, setData] = useState<FreightMemoDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const d = await freightService.get(id);
      setData(d);
    } catch (_e) {
      setErr('Could not load freight memo.');
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const onPrint = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  }, []);

  if (err) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Freight Memo</Text>
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{err}</Text>
        </View>
      </View>
    );
  }

  if (!data) return <Loader />;

  const bilty = data.bilty;
  const items = bilty?.items || [];
  const advances = bilty?.advances || [];
  const fuels = bilty?.fuels || [];

  // Build debit rows (items) and credit rows (advances + fuels).
  const debitRows = items.map((it, i) => ({
    key: `d-${it.id ?? i}`,
    label: debitLabel(it, i),
    amount: toNum(it.qty) * toNum(it.rate),
  }));
  const creditRows = [
    ...advances.map((a, i) => ({
      key: `c-a-${a.id ?? i}`,
      label: `Advance — ${a.adv_from ?? 'cash'}${a.narration ? ` (${a.narration})` : ''}`,
      amount: toNum(a.amount),
    })),
    ...fuels.map((f, i) => ({
      key: `c-f-${f.id ?? i}`,
      label: `Fuel — ${f.from_loc ?? 'pump'}${f.doc_no ? ` · ${f.doc_no}` : ''}`,
      amount: toNum(f.amount),
    })),
  ];

  // Pair left/right for the A4 ledger render.
  const ledgerRows: Array<{
    key: string;
    left: { label: string; amount: number } | null;
    right: { label: string; amount: number } | null;
  }> = [];
  const rowCount = Math.max(debitRows.length, creditRows.length);
  for (let i = 0; i < rowCount; i += 1) {
    ledgerRows.push({
      key: `r-${i}`,
      left: debitRows[i] ?? null,
      right: creditRows[i] ?? null,
    });
  }

  const freightTotal = toNum(data.freight_total);
  const advanceTotal = toNum(data.advance_total);
  const fuelTotal = toNum(data.fuel_total);
  const creditTotal = advanceTotal + fuelTotal;
  const netPayable = toNum(data.net_payable);

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      {/* ---- Top bar with Back / Print (hidden from print via no-print class on web) ---- */}
      <View style={styles.topBar} accessibilityElementsHidden={false}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.topBtn}
          accessibilityRole="button"
          testID="memo-back-btn"
        >
          <Text style={styles.topBtnText}>Back</Text>
        </Pressable>
        {Platform.OS === 'web' ? (
          <Pressable
            onPress={onPrint}
            style={[styles.topBtn, styles.topBtnPrimary]}
            accessibilityRole="button"
            testID="memo-print-btn"
          >
            <Text style={[styles.topBtnText, styles.topBtnPrimaryText]}>Print</Text>
          </Pressable>
        ) : null}
      </View>

      {/* ---- A4 ledger sheet ---- */}
      <View style={styles.sheet} testID="memo-sheet">
        {/* Company / memo header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.companyName}>{COMPANY_NAME}</Text>
            <Text style={styles.companyTagline}>{COMPANY_TAGLINE}</Text>
          </View>
          <View style={styles.memoMeta}>
            <KV label="Memo No" value={data.memo_no} mono strong />
            <KV label="Date" value={shortDate(data.memo_date)} mono />
          </View>
        </View>

        <View style={styles.divider} />

        {/* Bilty reference */}
        {bilty ? (
          <View style={styles.refBlock}>
            <KV label="Bilty No" value={bilty.bilty_no} mono />
            <KV label="Bilty Date" value={shortDate(bilty.bilty_date)} mono />
            <KV label="Consignor" value={bilty.consignor} />
            <KV label="Truck No" value={bilty.truck_no} mono />
            {bilty.goods_type ? <KV label="Goods" value={bilty.goods_type} /> : null}
            {bilty.branch ? <KV label="Branch" value={bilty.branch} /> : null}
          </View>
        ) : (
          <View style={styles.refBlock}>
            <Text style={styles.mutedText}>Linked bilty no longer exists.</Text>
          </View>
        )}

        {/* Ledger */}
        <View style={styles.ledgerHead}>
          <Text style={styles.ledgerHeadText}>Debit</Text>
          <Text style={styles.ledgerHeadText}>Credit</Text>
        </View>
        <View style={styles.ledgerSubHead}>
          <View style={styles.ledgerCell}>
            <Text style={styles.subHeadLabel}>Particulars</Text>
            <Text style={styles.subHeadAmt}>Amount</Text>
          </View>
          <View style={styles.ledgerDividerCol} />
          <View style={styles.ledgerCell}>
            <Text style={styles.subHeadLabel}>Particulars</Text>
            <Text style={styles.subHeadAmt}>Amount</Text>
          </View>
        </View>

        {ledgerRows.length === 0 ? (
          <View style={styles.ledgerEmpty}>
            <Text style={styles.mutedText}>No entries.</Text>
          </View>
        ) : (
          ledgerRows.map((row) => (
            <View key={row.key} style={styles.ledgerRow}>
              <LedgerCell entry={row.left} testPrefix="debit" />
              <View style={styles.ledgerDividerCol} />
              <LedgerCell entry={row.right} testPrefix="credit" />
            </View>
          ))
        )}

        {/* Totals row */}
        <View style={styles.ledgerTotalRow}>
          <View style={styles.ledgerCell}>
            <Text style={styles.totalLabel}>Freight Total</Text>
            <Text style={styles.totalAmt} testID="freight-total">{fmt(freightTotal)}</Text>
          </View>
          <View style={styles.ledgerDividerCol} />
          <View style={styles.ledgerCell}>
            <Text style={styles.totalLabel}>Advance + Fuel</Text>
            <Text style={styles.totalAmt} testID="credit-total">{fmt(creditTotal)}</Text>
          </View>
        </View>

        {/* Component totals for clarity (advance / fuel split) */}
        <View style={styles.totalsSplit}>
          <KV label="Advance Total" value={fmt(advanceTotal)} mono />
          <KV label="Fuel Total" value={fmt(fuelTotal)} mono />
        </View>

        {/* Net Payable — highlighted */}
        <View style={styles.netBox}>
          <Text style={styles.netLabel}>Net Payable</Text>
          <Text style={styles.netAmt} testID="net-payable">₹ {fmt(netPayable)}</Text>
        </View>

        <Text style={styles.footerNote}>
          This memo is auto-generated from bilty #{bilty?.bilty_no ?? '—'}. It is
          read-only; any correction must be made on the source bilty.
        </Text>
      </View>
    </ScrollView>
  );
}

function LedgerCell({
  entry,
  testPrefix,
}: {
  entry: { label: string; amount: number } | null;
  testPrefix: string;
}) {
  if (!entry) {
    return (
      <View style={styles.ledgerCell}>
        <Text style={styles.cellMuted}> </Text>
        <Text style={styles.cellAmtMuted}> </Text>
      </View>
    );
  }
  return (
    <View style={styles.ledgerCell}>
      <Text style={styles.cellLabel} numberOfLines={2}>{entry.label}</Text>
      <Text style={styles.cellAmt} testID={`${testPrefix}-amt`}>
        {fmt(entry.amount)}
      </Text>
    </View>
  );
}

function KV({
  label,
  value,
  mono,
  strong,
}: {
  label: string;
  value: string | null | undefined | number;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text
        style={[
          styles.kvValue,
          mono && { fontFamily: typography.mono },
          strong && { fontFamily: typography.uiBold, color: colors.text },
        ]}
      >
        {value !== null && value !== undefined && value !== '' ? String(value) : '—'}
      </Text>
    </View>
  );
}

function debitLabel(it: import('../../../shared/types/bilty').BiltyItem, i: number): string {
  const who = it.consignee ? ` · ${it.consignee}` : '';
  const route =
    it.from_loc || it.to_loc
      ? ` · ${it.from_loc ?? '—'} → ${it.to_loc ?? '—'}`
      : '';
  const qr = ` (${fmt(it.qty)} × ${fmt(it.rate)})`;
  return `Item ${i + 1}${who}${route}${qr}`;
}

function fmt(n: unknown): string {
  return toNum(n).toFixed(2);
}

function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
    return d.toISOString().slice(0, 10);
  } catch {
    return String(iso).slice(0, 10);
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, alignItems: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    maxWidth: 820,
    width: '100%',
    marginBottom: spacing.lg,
  },
  topBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  topBtnPrimary: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  topBtnText: {
    color: colors.text,
    fontFamily: typography.uiBold,
    fontSize: 13,
  },
  topBtnPrimaryText: {
    color: colors.card,
  },
  sheet: {
    width: '100%',
    maxWidth: 820,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  companyName: {
    fontSize: 26,
    color: colors.text,
    fontFamily: typography.uiBold,
    letterSpacing: 1,
  },
  companyTagline: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: typography.ui,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  memoMeta: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.text,
    marginVertical: spacing.md,
  },
  refBlock: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  kv: { minWidth: 140 },
  kvLabel: { fontSize: 10, color: colors.textMuted, fontFamily: typography.ui, textTransform: 'uppercase', letterSpacing: 0.5 },
  kvValue: { fontSize: 13, color: colors.text, fontFamily: typography.ui, marginTop: 2 },
  ledgerHead: {
    flexDirection: 'row',
    borderTopWidth: 2,
    borderBottomWidth: 1,
    borderColor: colors.text,
  },
  ledgerHeadText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    color: colors.text,
    fontFamily: typography.uiBold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingVertical: spacing.sm,
  },
  ledgerSubHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  ledgerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  ledgerCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 32,
    gap: spacing.sm,
  },
  ledgerDividerCol: {
    width: 1,
    backgroundColor: colors.text,
  },
  subHeadLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.uiBold,
    textTransform: 'uppercase',
  },
  subHeadAmt: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.uiBold,
    textTransform: 'uppercase',
  },
  cellLabel: {
    flex: 1,
    fontSize: 12,
    color: colors.text,
    fontFamily: typography.ui,
  },
  cellAmt: {
    fontSize: 13,
    color: colors.text,
    fontFamily: typography.mono,
    textAlign: 'right',
  },
  cellMuted: { flex: 1 },
  cellAmtMuted: { fontFamily: typography.mono },
  ledgerEmpty: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  ledgerTotalRow: {
    flexDirection: 'row',
    borderTopWidth: 2,
    borderBottomWidth: 1,
    borderColor: colors.text,
    backgroundColor: colors.background,
  },
  totalLabel: {
    fontSize: 12,
    color: colors.text,
    fontFamily: typography.uiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalAmt: {
    fontSize: 14,
    color: colors.text,
    fontFamily: typography.mono,
    textAlign: 'right',
  },
  totalsSplit: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xl,
    marginTop: spacing.md,
  },
  netBox: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.text,
    backgroundColor: colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  netLabel: {
    fontSize: 16,
    color: colors.text,
    fontFamily: typography.uiBold,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  netAmt: {
    fontSize: 20,
    color: colors.text,
    fontFamily: typography.mono,
  },
  footerNote: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.ui,
    fontStyle: 'italic',
    marginTop: spacing.xl,
    textAlign: 'center',
  },
  mutedText: {
    color: colors.textMuted,
    fontFamily: typography.ui,
    fontSize: 12,
  },
  title: { fontSize: 22, color: colors.text, fontFamily: typography.uiBold, padding: spacing.lg },
  errorBanner: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: spacing.md,
    margin: spacing.lg,
  },
  errorBannerText: {
    color: colors.danger,
    fontFamily: typography.ui,
    fontSize: 13,
  },
});
