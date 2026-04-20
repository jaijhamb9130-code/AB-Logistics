/**
 * BiltyDetailScreen — read-only view of a saved bilty (Phase 3).
 * Renders header + items + advances + fuels + totals (computed client-side).
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DataTable, type Column } from '../components/DataTable';
import { Loader } from '../components/Loader';
import { colors, radius, spacing, typography } from '../constants/theme';
import { biltyService } from '../services/biltyService';
import { freightService } from '../services/freightService';
import { CommonActions } from '@react-navigation/native';
import {
  advanceTotal,
  fuelTotal,
  itemsTotal,
  netPayable,
  toNum,
} from '../utils/biltyValidation';
import type {
  AdvanceDetail,
  BiltyDetail,
  BiltyItem,
  FuelDetail,
} from '../../../shared/types/bilty';
import type { BiltyStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<BiltyStackParamList, 'BiltyDetail'>;
type Rt = RouteProp<BiltyStackParamList, 'BiltyDetail'>;

export function BiltyDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { id } = route.params;
  const [data, setData] = useState<BiltyDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [memoErr, setMemoErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      navigation.navigate('BiltyList');
      return;
    }
    setErr(null);
    try {
      const d = await biltyService.get(id);
      setData(d);
    } catch (_e) {
      setErr('Could not load bilty.');
    }
  }, [id, navigation]);

  useEffect(() => { load(); }, [load]);

  /**
   * Phase 4 — generate (or jump to existing) freight memo for this bilty.
   * CLAUDE.md rule honored: memo is derived — this button is the ONLY entry
   * point from the bilty side. 409 means a memo already exists → we route to
   * the existing memo so the action is idempotent UX.
   */
  const generateMemo = useCallback(async () => {
    if (generating) return;
    setMemoErr(null);
    setGenerating(true);
    try {
      const memo = await freightService.generate(id);
      navigation.dispatch(
        CommonActions.navigate({
          name: 'Freight',
          params: { screen: 'FreightDetail', params: { id: memo.id } },
        })
      );
    } catch (e: any) {
      const code = e?.response?.status;
      if (code === 409) {
        try {
          const existing = await freightService.getByBiltyId(id);
          navigation.dispatch(
            CommonActions.navigate({
              name: 'Freight',
              params: { screen: 'FreightDetail', params: { id: existing.id } },
            })
          );
          return;
        } catch {
          setMemoErr('A freight memo already exists for this bilty.');
        }
      } else if (code === 403) {
        setMemoErr('You are not permitted to generate freight memos.');
      } else if (code === 404) {
        setMemoErr('Bilty not found.');
      } else {
        setMemoErr('Could not generate freight memo. Try again.');
      }
    } finally {
      setGenerating(false);
    }
  }, [generating, id, navigation]);

  if (err) {
    return (
      <View style={styles.wrap}>
        <View style={styles.errorWrap}>
          <Text style={styles.title}>Bilty</Text>
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{err}</Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate('BiltyList')}
            style={styles.backBtn}
            accessibilityRole="button"
          >
            <Text style={styles.backBtnText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!data) return <Loader />;

  const itemCols: Column<BiltyItem>[] = [
    { key: 'challan_no', label: 'Challan', width: 100, render: (r) => r.challan_no ?? '—' },
    { key: 'lr_no', label: 'LR No', width: 100, render: (r) => r.lr_no ?? '—' },
    { key: 'from_loc', label: 'From', width: 110, render: (r) => r.from_loc ?? '—' },
    { key: 'to_loc', label: 'To', width: 110, render: (r) => r.to_loc ?? '—' },
    { key: 'consignee', label: 'Consignee', render: (r) => r.consignee ?? '—' },
    { key: 'qty', label: 'Qty', width: 80, align: 'right', render: (r) => fmt(r.qty) },
    { key: 'rate', label: 'Rate', width: 90, align: 'right', render: (r) => fmt(r.rate) },
    { key: 'amount', label: 'Amount', width: 100, align: 'right',
      render: (r) => fmt(toNum(r.qty) * toNum(r.rate)) },
  ];

  const advCols: Column<AdvanceDetail>[] = [
    { key: 'adv_date', label: 'Date', width: 120, render: (r) => shortDate(r.adv_date) },
    { key: 'adv_from', label: 'From', width: 140, render: (r) => r.adv_from ?? '—' },
    { key: 'amount', label: 'Amount', width: 120, align: 'right', render: (r) => fmt(r.amount) },
    { key: 'narration', label: 'Narration', render: (r) => r.narration ?? '—' },
  ];

  const fuelCols: Column<FuelDetail>[] = [
    { key: 'from_loc', label: 'From', width: 150, render: (r) => r.from_loc ?? '—' },
    { key: 'amount', label: 'Amount', width: 120, align: 'right', render: (r) => fmt(r.amount) },
    { key: 'doc_no', label: 'Doc No', width: 140, render: (r) => r.doc_no ?? '—' },
    { key: 'doc_date', label: 'Doc Date', width: 140, render: (r) => shortDate(r.doc_date) },
  ];

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{data.bilty_no}</Text>
          <Text style={styles.subtitle}>
            {shortDate(data.bilty_date)} · {data.consignor} · {data.truck_no}
          </Text>
        </View>
        <View style={styles.headerBtns}>
          <Pressable
            onPress={generateMemo}
            disabled={generating}
            style={[styles.backBtn, styles.memoBtn, generating && styles.memoBtnDisabled]}
            accessibilityRole="button"
            testID="generate-memo-btn"
          >
            <Text style={[styles.backBtnText, styles.memoBtnText]}>
              {generating ? 'Generating…' : 'Generate Freight Memo'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            accessibilityRole="button"
          >
            <Text style={styles.backBtnText}>Back</Text>
          </Pressable>
        </View>
      </View>

      {memoErr ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{memoErr}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Details</Text>
        <View style={styles.grid}>
          <KV label="Owner" value={data.owner_name} />
          <KV label="Agent" value={data.agent_name} />
          <KV label="Branch" value={data.branch} />
          <KV label="Zone" value={data.zone_name} />
          <KV label="Goods Type" value={data.goods_type} />
          <KV label="Truck Type" value={data.truck_type} />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Items</Text>
      <View style={styles.tableWrap}>
        <DataTable<BiltyItem>
          columns={itemCols}
          rows={data.items || []}
          keyExtractor={(r) => r.id ?? Math.random()}
          stickyHeader={false}
          emptyLabel="No items."
        />
      </View>

      <Text style={styles.sectionTitle}>Advance Details</Text>
      <View style={styles.tableWrap}>
        <DataTable<AdvanceDetail>
          columns={advCols}
          rows={data.advances || []}
          keyExtractor={(r) => r.id ?? Math.random()}
          stickyHeader={false}
          emptyLabel="No advances."
        />
      </View>

      <Text style={styles.sectionTitle}>Fuel Details</Text>
      <View style={styles.tableWrap}>
        <DataTable<FuelDetail>
          columns={fuelCols}
          rows={data.fuels || []}
          keyExtractor={(r) => r.id ?? Math.random()}
          stickyHeader={false}
          emptyLabel="No fuel entries."
        />
      </View>

      <View style={styles.totalsBox}>
        <KV label="Freight Total" value={fmt(itemsTotal(data.items))} mono />
        <KV label="Advance Total" value={fmt(advanceTotal(data.advances))} mono />
        <KV label="Fuel Total" value={fmt(fuelTotal(data.fuels))} mono />
        <KV
          label="Net Payable"
          value={fmt(netPayable(data.items, data.advances, data.fuels))}
          mono
          strong
        />
      </View>
    </ScrollView>
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
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: { fontSize: 24, color: colors.text, fontFamily: typography.uiBold },
  subtitle: { fontSize: 15, color: colors.textMuted, fontFamily: typography.ui, marginTop: spacing.xs },
  backBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backBtnText: {
    color: colors.text,
    fontFamily: typography.uiBold,
    fontSize: 15,
  },
  headerBtns: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  memoBtn: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  memoBtnDisabled: {
    opacity: 0.6,
  },
  memoBtnText: {
    color: colors.card,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 17,
    color: colors.text,
    fontFamily: typography.uiBold,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  kv: { minWidth: 180 },
  kvLabel: { fontSize: 13, color: colors.textMuted, fontFamily: typography.uiBold },
  kvValue: { fontSize: 15, color: colors.text, fontFamily: typography.ui, marginTop: 3 },
  tableWrap: { minHeight: 120, marginBottom: spacing.md },
  totalsBox: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  errorWrap: {
    padding: spacing.lg,
  },
  errorBanner: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: spacing.md,
    marginVertical: spacing.lg,
  },
  errorBannerText: {
    color: colors.danger,
    fontFamily: typography.ui,
    fontSize: 13,
  },
});
