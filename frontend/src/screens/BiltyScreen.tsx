/**
 * BiltyScreen — list of bilties + "New Bilty" entry (Phase 3).
 *
 * Reuses DataTable with 7 columns: Bilty No, Date, Consignor, Truck No,
 * Items, Created, Actions (View). "New Bilty" ButtonPrimary navigates to
 * BiltyForm. Row tap also navigates to BiltyDetail.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ButtonPrimary } from '../components/ButtonPrimary';
import { DataTable, type Column } from '../components/DataTable';
import { Loader } from '../components/Loader';
import { colors, radius, spacing, text, typography } from '../constants/theme';
import { biltyService } from '../services/biltyService';
import { useAuth } from '../context/AuthContext';
import type { BiltyListItem } from '../../../shared/types/bilty';
import type { BiltyStackParamList } from '../navigation/types';
import { useResponsive } from '../hooks/useResponsive';
import { getTodayISO } from '../utils/dateUtils';
import { canDoAction } from '../navigation/guards';

type Nav = NativeStackNavigationProp<BiltyStackParamList, 'BiltyList'>;

export function BiltyScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { isMobile } = useResponsive();
  
  const canView = canDoAction(user, 'bilty', 'view');
  const canCreate = canDoAction(user, 'bilty', 'create');
  // Edit / Delete are gated and exposed inside BiltyDetailScreen — the list
  // page only offers an "Open" button per row.
  const [rows, setRows] = useState<BiltyListItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // Default: today — so users see today's bilties first. They can change the
  // date manually or clear it (×) to see all dates.
  const [dateFilter, setDateFilter] = useState<string>(() => getTodayISO());

  // Card search — matches any of the visible card fields (case-insensitive).
  // Date picker filters by `bilty_date` (exact ISO match) when set.
  const filteredRows = useMemo(() => {
    if (!rows) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (dateFilter) {
        const rowDate = formatDate(r.bilty_date); // YYYY-MM-DD
        if (rowDate !== dateFilter) return false;
      }
      if (!q) return true;
      const haystack = [
        r.bilty_no,
        r.consignor,
        r.truck_no,
        r.bilty_date ?? '',
        r.created_by_username ?? '',
        formatDate(r.bilty_date),
        formatTimeOnly(r.created_at),
        formatDateTime(r.created_at),
        String(r.item_count ?? ''),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, query, dateFilter]);

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

  // The Bilty tab is mounted for users with `voucher.view` so the Daybook
  // can navigate to BiltyForm for editing. The list page itself, however,
  // belongs to `bilty.view` only — bounce other users to the Daybook.
  // Use getParent() to escape the BiltyStack and switch tabs at the
  // AppTabs level — calling `navigate('Billing', ...)` from inside a
  // sibling stack is a no-op because the current navigator has no such
  // route.
  useEffect(() => {
    if (canView) return;
    const tabsNav = navigation.getParent();
    if (tabsNav) {
      (tabsNav as any).navigate('Billing', { screen: 'Daybook' });
    }
  }, [canView, navigation]);

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
      width: 100,
      align: 'right',
      render: (r) => (
        <Pressable
          onPress={(e: any) => {
            e?.stopPropagation?.();
            navigation.navigate('BiltyDetail', { id: r.id });
          }}
          accessibilityRole="button"
          accessibilityLabel={`Open ${r.bilty_no}`}
          testID={`open-${r.id}`}
          style={({ pressed }) => [styles.actionsBtn, pressed && styles.actionsBtnPressed]}
        >
          <Text style={styles.actionsBtnText}>Open</Text>
        </Pressable>
      ),
    },
  ];

  // Don't render the list while we're redirecting voucher-only users.
  if (!canView) return <Loader />;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Reports</Text>
      </View>

      {err ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{err}</Text>
        </View>
      ) : null}

      {/* Search bar — matches any card field. Date picker on the right
          filters cards to a specific bilty_date. (mobile only) */}
      {isMobile ? (
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search bilty no, consignor, truck, user..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
            accessibilityLabel="Search bilty cards"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
              <Text style={styles.searchClear}>×</Text>
            </Pressable>
          ) : null}

          {/* Date filter — calendar input pinned to the right corner */}
          <View style={styles.searchDivider} />
          <View style={styles.searchDateWrap}>
            {Platform.OS === 'web' ? (
              React.createElement('input', {
                type: 'date',
                value: dateFilter,
                onChange: (e: any) => setDateFilter(e?.target?.value || ''),
                'aria-label': 'Filter by date',
                style: searchDateInputStyle,
              })
            ) : (
              <Text style={styles.searchDateLabel}>{dateFilter || 'Date'}</Text>
            )}
          </View>
        </View>
      ) : null}

      {rows === null ? (
        <Loader />
      ) : isMobile ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.cardListWrap}
          showsVerticalScrollIndicator={false}
        >
          {(filteredRows ?? []).length === 0 ? (
            <Text style={styles.emptyText}>
              {query ? 'No bilties match your search.' : 'No bilties yet. Create one from Vouchers → Bilty.'}
            </Text>
          ) : (
            (filteredRows ?? []).map((r) => (
              <BiltyCard
                key={r.id}
                row={r}
                onPress={() => navigation.navigate('BiltyDetail', { id: r.id })}
              />
            ))
          )}
        </ScrollView>
      ) : (
        <View style={styles.tableWrap}>
          <DataTable<BiltyListItem>
            columns={columns}
            rows={rows}
            keyExtractor={(r) => r.id}
            onRowPress={(r) => navigation.navigate('BiltyDetail', { id: r.id })}
            emptyLabel="No bilties yet. Create one from Vouchers → Bilty."
            testID="bilty-table"
          />
        </View>
      )}
    </View>
  );
}

function BiltyCard({ row, onPress }: { row: BiltyListItem; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${row.bilty_no}`}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {/* Line 1 — Bilty No (left) · Date (right) */}
      <View style={styles.cardTop}>
        <Text style={styles.cardBiltyNo}>{row.bilty_no}</Text>
        <Text style={styles.cardDate}>{formatDate(row.bilty_date)}</Text>
      </View>

      {/* Line 2 — Consignor */}
      <View style={styles.cardKVRow}>
        <Text style={styles.cardKVLabel}>Consignor</Text>
        <Text style={styles.cardKVValue} numberOfLines={1}>{row.consignor || '—'}</Text>
      </View>

      {/* Line 3 — Truck No */}
      <View style={styles.cardKVRow}>
        <Text style={styles.cardKVLabel}>Truck No</Text>
        <Text style={styles.cardKVValue} numberOfLines={1}>{row.truck_no || '—'}</Text>
      </View>

      {/* Line 4 — Footer: By admin · time  +  ITEMS badge on the right */}
      <View style={styles.cardFooter}>
        <Text style={styles.cardFooterText} numberOfLines={1}>
          {row.created_by_username ? `By ${row.created_by_username}` : 'Created'} · {formatTimeOnly(row.created_at)}
        </Text>
        <View style={styles.cardItemsBadge}>
          <Text style={styles.cardItemsValue}>{Number(row.item_count ?? 0)}</Text>
          <Text style={styles.cardItemsLabel}>ITEMS</Text>
        </View>
      </View>
    </Pressable>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  // Slice the YYYY-MM-DD prefix directly — going through `new Date()` shifts
  // the date across timezones (a bilty with bilty_date='2026-05-04' would
  // round-trip to '2026-05-03' for users east of UTC).
  return String(iso).slice(0, 10);
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

function formatTimeOnly(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    // HH:MM:SS — date already shown at the top of the card.
    return d.toISOString().slice(11, 19);
  } catch {
    return iso;
  }
}

const searchDateInputStyle = {
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontSize: 12,
  fontFamily: 'inherit',
  fontWeight: 600,
  color: '#0F172A',
  height: 22,
  padding: 0,
  cursor: 'pointer',
  width: 124,
};

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: { ...text.heading, fontSize: 24, lineHeight: 32 },
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
  actionsBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  actionsBtnPressed: {
    backgroundColor: '#F1F5F9',
  },
  actionsBtnText: {
    fontSize: 13,
    color: colors.textStrong,
    fontFamily: typography.uiBold,
  },

  // ── Mobile search bar
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    gap: 8,
  },
  searchIcon: {
    fontSize: 16,
    color: colors.textMuted,
    fontFamily: typography.uiBold,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.textStrong,
    fontFamily: typography.uiMedium,
    height: 22,
    padding: 0,
  },
  searchClear: {
    fontSize: 18,
    color: colors.textMuted,
    fontFamily: typography.uiBold,
    paddingHorizontal: 4,
  },
  searchDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 4,
  },
  searchDateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  searchDateLabel: {
    fontSize: 12,
    color: colors.textStrong,
    fontFamily: typography.uiBold,
    letterSpacing: 0.3,
  },

  // ── Mobile cards
  cardListWrap: { flex: 1, gap: spacing.sm },
  emptyText: {
    color: colors.textMuted,
    fontFamily: typography.uiMedium,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    marginBottom: 8,
  },
  cardPressed: { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardBiltyNo: {
    fontSize: 15,
    fontFamily: typography.uiHeavy,
    color: colors.textStrong,
    letterSpacing: 0.3,
  },
  cardDate: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: typography.uiMedium,
  },
  cardItemsBadge: {
    backgroundColor: 'rgba(247,72,61,0.10)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  cardItemsValue: {
    fontSize: 12,
    color: colors.brandRed,
    fontFamily: typography.uiHeavy,
  },
  cardItemsLabel: {
    fontSize: 9,
    color: colors.brandRed,
    fontFamily: typography.uiHeavy,
    letterSpacing: 0.8,
  },
  cardKVRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
    gap: spacing.sm,
  },
  cardKVLabel: {
    color: colors.textMuted,
    fontFamily: typography.uiMedium,
    fontSize: 12,
  },
  cardKVValue: {
    color: colors.textStrong,
    fontFamily: typography.uiMedium,
    fontSize: 13,
    flexShrink: 1,
    textAlign: 'right',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 8,
  },
  cardFooterText: {
    flex: 1,
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.uiMedium,
    letterSpacing: 0.2,
  },
});
