/**
 * VouchersListScreen — paginated list of all vouchers with filters.
 * Tally-dense table; tap row → VoucherForm in edit mode.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ButtonPrimary } from '../components/ButtonPrimary';
import { DataTable, type Column } from '../components/DataTable';
import { Loader } from '../components/Loader';
import { colors, radius, spacing, text, typography } from '../constants/theme';
import { voucherService } from '../services/voucherService';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import type { VoucherListItem } from '../../../shared/types/voucher';
import type { BillingStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import { canDoAction } from '../navigation/guards';

type Nav = NativeStackNavigationProp<BillingStackParamList, 'VouchersList'>;

const VCH_TYPES = ['', 'Sales', 'Purchase', 'Receipt', 'Payment', 'Journal', 'Contra', 'Debit Note', 'Credit Note'];

function fmtMoney(v: number | string | null | undefined): string {
  if (v == null || v === '') return '0.00';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return String(iso).slice(0, 10);
}

export function VouchersListScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const [rows, setRows] = useState<VoucherListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [vchType, setVchType] = useState<string>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await voucherService.list({
        page, limit,
        vch_type: vchType || undefined,
        search: search.trim() || undefined,
      });
      setRows(r.data);
      setTotal(r.total);
    } catch {
      setError('Could not load vouchers.');
      setRows([]);
    }
  }, [page, limit, vchType, search]);

  useAutoRefresh(load);
  useEffect(() => { load(); }, [load]);

  const columns: Column<VoucherListItem>[] = [
    {
      key: 'vch_type',
      label: 'Type',
      width: 120,
      render: (r) => (
        <View style={[styles.typePill, typePillColor(r.vch_type_name)]}>
          <Text style={[text.pill, { color: colors.textStrong }]}>{r.vch_type_name || '—'}</Text>
        </View>
      ),
    },
    {
      key: 'vch_no',
      label: 'Voucher No',
      width: 130,
      render: (r) => <Text style={text.value}>{r.vch_no || '—'}</Text>,
    },
    {
      key: 'vch_date',
      label: 'Date',
      width: 110,
      render: (r) => <Text style={text.value}>{fmtDate(r.vch_date)}</Text>,
    },
    {
      key: 'party_name',
      label: 'Ledger',
      render: (r) => <Text style={text.value} numberOfLines={1}>{r.party_name || '—'}</Text>,
    },
    {
      key: 'amount',
      label: 'Amount (₹)',
      width: 130,
      align: 'right',
      render: (r) => <Text style={[text.numeric, { color: colors.textStrong }]}>{fmtMoney(r.amount)}</Text>,
    },
  ];

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={text.heading}>Billing — Vouchers</Text>
        <View style={styles.headerActions}>
          {canDoAction(user, 'voucher', 'view') && (
            <Pressable
              style={styles.daybookBtn}
              onPress={() => navigation.navigate('Daybook', { date: new Date().toISOString().slice(0, 10) })}
            >
              <Text style={[text.action, { color: colors.text }]}>Daybook</Text>
            </Pressable>
          )}
          {canDoAction(user, 'voucher', 'create') && (
            <ButtonPrimary
              title="+ New Voucher"
              onPress={() => navigation.navigate('VoucherForm', undefined)}
            />
          )}
        </View>
      </View>

      <View style={styles.filters}>
        <View style={styles.searchWrap}>
          <Text style={styles.filterLabel}>Search</Text>
          <TextInput
            value={search}
            onChangeText={(v) => { setSearch(v); setPage(1); }}
            placeholder="Voucher no or party name…"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
        </View>
        <View style={styles.typeWrap}>
          <Text style={styles.filterLabel}>Type</Text>
          <View style={styles.typeChips}>
            {VCH_TYPES.map((t) => {
              const active = vchType === t;
              return (
                <Pressable
                  key={t || 'all'}
                  onPress={() => { setVchType(t); setPage(1); }}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {t || 'All'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
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
            onRowPress={(r) => {
              if (canDoAction(user, 'voucher', 'view')) {
                navigation.navigate('VoucherForm', { id: r.id });
              }
            }}
            emptyLabel="No vouchers yet — create one with + New Voucher"
            showSerialNo={false}
          />
          {total > limit ? (
            <View style={styles.paginator}>
              <Pressable
                disabled={page <= 1}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                style={[styles.pageBtn, page <= 1 && { opacity: 0.4 }]}
              >
                <Text style={text.action}>‹ Prev</Text>
              </Pressable>
              <Text style={text.meta}>Page {page} of {totalPages}  ·  {total} total</Text>
              <Pressable
                disabled={page >= totalPages}
                onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                style={[styles.pageBtn, page >= totalPages && { opacity: 0.4 }]}
              >
                <Text style={text.action}>Next ›</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

function typePillColor(name: string | null) {
  const n = (name || '').toLowerCase();
  if (n.includes('sales') || n.includes('debit')) return { backgroundColor: colors.brandRedTone, borderColor: colors.brandRedBorder };
  if (n.includes('purchase') || n.includes('credit')) return { backgroundColor: colors.brandYellowTone, borderColor: colors.brandYellowBorder };
  return { backgroundColor: colors.background, borderColor: colors.border };
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  tableWrap: { flex: 1, minHeight: 200 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  daybookBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  searchWrap: { flex: 1, minWidth: 240 },
  typeWrap: { flex: 2, minWidth: 320 },
  filterLabel: {
    fontSize: 12,
    fontFamily: typography.uiBold,
    color: colors.textLabel,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: typography.uiMedium,
    color: colors.text,
  },
  typeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: {
    backgroundColor: colors.brandRedTone,
    borderColor: colors.brandRed,
  },
  chipText: {
    fontSize: 12,
    fontFamily: typography.uiMedium,
    color: colors.textLabel,
  },
  chipTextActive: { color: colors.brandRed, fontFamily: typography.uiBold },
  typePill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
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
  paginator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
  },
  pageBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
});
