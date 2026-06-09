import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Loader } from '../components/Loader';
import { reportService } from '../services/reportService';
import { colors, spacing, typography } from '../constants/theme';
import { getTodayISO } from '../utils/dateUtils';

const PAGE_SIZE = 10;
const fmt = (n: any) => Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const fmtDate = (s: string) => {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

type SortKey = 'bilty_date' | 'bilty_no' | 'consignor' | 'truck_no' | 'branch' | 'item_count' | 'freight_total';

function sortRows(rows: any[], key: SortKey, dir: 'asc' | 'desc') {
  return [...rows].sort((a, b) => {
    const av = a[key] ?? '';
    const bv = b[key] ?? '';
    const n = ['item_count', 'freight_total'].includes(key);
    const cmp = n ? Number(av) - Number(bv) : String(av).localeCompare(String(bv));
    return dir === 'asc' ? cmp : -cmp;
  });
}

export function BiltyRegisterScreen() {
  const navigation = useNavigation();
  const today = getTodayISO();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [truck, setTruck] = useState('');
  const [consignor, setConsignor] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('bilty_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (f: string, t: string, tr: string, co: string) => {
    setLoading(true); setErr(null);
    try {
      const data = await reportService.getBiltyRegister({ from: f, to: t, truck: tr || undefined, consignor: co || undefined });
      setRows(data ?? []);
      setPage(0);
    } catch { setErr('Failed to load.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => load(from, to, truck, consignor), 200);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [from, to, truck, consignor]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(0);
  };

  const sorted = sortRows(rows, sortKey, sortDir);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(curPage * PAGE_SIZE, (curPage + 1) * PAGE_SIZE);
  const totalFreight = rows.reduce((s, r) => s + Number(r.freight_total ?? 0), 0);
  const totalItems = rows.reduce((s, r) => s + Number(r.item_count ?? 0), 0);

  const arrow = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕';
  const hStyle = (key: SortKey) => sortKey === key ? [styles.th, styles.thSorted] : [styles.th];

  return (
    <View style={styles.wrap}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Back</Text>
          </Pressable>
          <Text style={styles.title}>Bilty Register</Text>
        </View>
        <View style={styles.filterRow}>
          <View style={styles.filterField}>
            <Text style={styles.filterLabel}>FROM</Text>
            {Platform.OS === 'web'
              ? React.createElement('input', { type: 'date', value: from, onChange: (e: any) => setFrom(e.target.value), style: webInputStyle })
              : <TextInput style={styles.input} value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" />}
          </View>
          <View style={styles.filterField}>
            <Text style={styles.filterLabel}>TO</Text>
            {Platform.OS === 'web'
              ? React.createElement('input', { type: 'date', value: to, onChange: (e: any) => setTo(e.target.value), style: webInputStyle })
              : <TextInput style={styles.input} value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" />}
          </View>
          <View style={styles.filterField}>
            <Text style={styles.filterLabel}>TRUCK</Text>
            <TextInput style={styles.input} value={truck} onChangeText={setTruck} placeholder="All trucks" placeholderTextColor="#9CA3AF" />
          </View>
          <View style={styles.filterField}>
            <Text style={styles.filterLabel}>CONSIGNOR</Text>
            <TextInput style={styles.input} value={consignor} onChangeText={setConsignor} placeholder="All consignors" placeholderTextColor="#9CA3AF" />
          </View>
        </View>
      </View>

      {/* Summary bar */}
      {!loading && !err && (
        <View style={styles.summaryBar}>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryLabel}>TOTAL FREIGHT</Text>
            <Text style={[styles.summaryValue, { color: '#2563EB' }]}>{fmt(totalFreight)}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryChip}>
            <Text style={styles.summaryLabel}>BILTIES</Text>
            <Text style={[styles.summaryValue, { color: '#111827' }]}>{rows.length}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryChip}>
            <Text style={styles.summaryLabel}>ITEMS</Text>
            <Text style={[styles.summaryValue, { color: '#111827' }]}>{totalItems}</Text>
          </View>
        </View>
      )}

      {loading ? <Loader /> : err ? (
        <Text style={styles.err}>{err}</Text>
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView style={{ flex: 1 }}>
            {/* Table header */}
            <View style={styles.thead}>
              <Text style={[styles.thSerial]}>#</Text>
              <Pressable style={{ flex: 1.1 }} onPress={() => handleSort('bilty_date')}>
                <Text style={hStyle('bilty_date')}>DATE{arrow('bilty_date')}</Text>
              </Pressable>
              <Pressable style={{ flex: 1.3 }} onPress={() => handleSort('bilty_no')}>
                <Text style={hStyle('bilty_no')}>BILTY NO{arrow('bilty_no')}</Text>
              </Pressable>
              <Pressable style={{ flex: 2 }} onPress={() => handleSort('consignor')}>
                <Text style={hStyle('consignor')}>CONSIGNOR{arrow('consignor')}</Text>
              </Pressable>
              <Pressable style={{ flex: 1.3 }} onPress={() => handleSort('truck_no')}>
                <Text style={hStyle('truck_no')}>TRUCK{arrow('truck_no')}</Text>
              </Pressable>
              <Pressable style={{ flex: 1 }} onPress={() => handleSort('branch')}>
                <Text style={hStyle('branch')}>BRANCH{arrow('branch')}</Text>
              </Pressable>
              <Pressable style={{ flex: 0.7 }} onPress={() => handleSort('item_count')}>
                <Text style={[...hStyle('item_count'), styles.right]}>ITEMS{arrow('item_count')}</Text>
              </Pressable>
              <Pressable style={{ flex: 1.2 }} onPress={() => handleSort('freight_total')}>
                <Text style={[...hStyle('freight_total'), styles.right]}>FREIGHT{arrow('freight_total')}</Text>
              </Pressable>
            </View>

            {rows.length === 0 ? (
              <View style={styles.empty}><Text style={styles.emptyText}>No bilties found for this range.</Text></View>
            ) : pageRows.map((r, i) => (
              <View key={r.id} style={[styles.trow, i % 2 === 1 && styles.trowAlt]}>
                <Text style={styles.tdSerial}>{curPage * PAGE_SIZE + i + 1}</Text>
                <Text style={[styles.td, { flex: 1.1 }]}>{fmtDate(r.bilty_date)}</Text>
                <Text style={[styles.td, styles.link, { flex: 1.3 }]} numberOfLines={1}>{r.bilty_no || '—'}</Text>
                <Text style={[styles.td, { flex: 2 }]} numberOfLines={1}>{r.consignor || '—'}</Text>
                <Text style={[styles.td, { flex: 1.3 }]} numberOfLines={1}>{r.truck_no || '—'}</Text>
                <Text style={[styles.td, { flex: 1 }]} numberOfLines={1}>{r.branch || '—'}</Text>
                <Text style={[styles.tdNum, { flex: 0.7 }]}>{r.item_count ?? 0}</Text>
                <Text style={[styles.tdNum, styles.blue, { flex: 1.2 }]}>{fmt(r.freight_total)}</Text>
              </View>
            ))}

            {/* Total row */}
            {rows.length > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalSerial}>—</Text>
                <Text style={[styles.totalLabel, { flex: 7.6 }]}>Total ({rows.length} bilties)</Text>
                <Text style={[styles.totalNum, { flex: 0.7 }]}>{totalItems}</Text>
                <Text style={[styles.totalNum, styles.blue, { flex: 1.2 }]}>{fmt(totalFreight)}</Text>
              </View>
            )}
          </ScrollView>

          {/* Pagination */}
          <View style={styles.pagination}>
            <Text style={styles.pageInfo}>
              {rows.length === 0 ? '0 records' : `${curPage * PAGE_SIZE + 1}–${Math.min((curPage + 1) * PAGE_SIZE, rows.length)} of ${rows.length}`}
            </Text>
            <View style={styles.pageNav}>
              <Pressable disabled={curPage === 0} onPress={() => setPage(0)} style={[styles.pageBtn, curPage === 0 && styles.pageBtnOff]}>
                <Text style={styles.pageBtnTxt}>«</Text>
              </Pressable>
              <Pressable disabled={curPage === 0} onPress={() => setPage(curPage - 1)} style={[styles.pageBtn, curPage === 0 && styles.pageBtnOff]}>
                <Text style={styles.pageBtnTxt}>‹</Text>
              </Pressable>
              <View style={styles.pageLabel}>
                <Text style={styles.pageLabelTxt}>Page {curPage + 1} / {totalPages}</Text>
              </View>
              <Pressable disabled={curPage === totalPages - 1} onPress={() => setPage(curPage + 1)} style={[styles.pageBtn, curPage === totalPages - 1 && styles.pageBtnOff]}>
                <Text style={styles.pageBtnTxt}>›</Text>
              </Pressable>
              <Pressable disabled={curPage === totalPages - 1} onPress={() => setPage(totalPages - 1)} style={[styles.pageBtn, curPage === totalPages - 1 && styles.pageBtnOff]}>
                <Text style={styles.pageBtnTxt}>»</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const webInputStyle = { height: 32, padding: '0 9px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', color: '#111827', backgroundColor: '#fff', outline: 'none' } as any;

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#F3F4F6' },

  // Header + filters combined
  header: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingHorizontal: spacing.lg, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, marginRight: 'auto' as any },
  backText: { fontFamily: typography.uiMedium, fontSize: 13, color: colors.brandRed },
  title: { fontFamily: typography.uiHeavy, fontSize: 18, color: '#111827', letterSpacing: -0.3 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' },
  filterField: { gap: 2 },
  filterLabel: { fontFamily: typography.uiBold, fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { height: 32, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 6, paddingHorizontal: 9, fontSize: 12, fontFamily: typography.uiMedium, color: '#111827', backgroundColor: '#fff', minWidth: 110 },

  // Summary bar
  summaryBar: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: 8, gap: 0 },
  summaryChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 4 },
  summaryDivider: { width: 1, height: 20, backgroundColor: '#E5E7EB' },
  summaryLabel: { fontFamily: typography.uiBold, fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue: { fontFamily: typography.uiHeavy, fontSize: 15, letterSpacing: -0.2 },

  err: { color: colors.danger, padding: spacing.md },
  empty: { padding: 48, alignItems: 'center' },
  emptyText: { fontFamily: typography.uiMedium, fontSize: 13, color: '#9CA3AF' },

  // Table
  thead: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F3F4F6', borderBottomWidth: 1.5, borderBottomColor: '#E5E7EB',
    paddingHorizontal: spacing.lg, minHeight: 36,
  },
  thSerial: { width: 40, fontFamily: typography.uiBold, fontSize: 11, color: '#9CA3AF', paddingHorizontal: 4 },
  th: { fontFamily: typography.uiBold, fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.3, paddingHorizontal: 6, paddingVertical: 8, ...(Platform.OS === 'web' ? { cursor: 'pointer', userSelect: 'none' } as any : {}) },
  thSorted: { color: '#111827' },
  right: { textAlign: 'right' },

  trow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingHorizontal: spacing.lg, minHeight: 38 },
  trowAlt: { backgroundColor: '#FAFAFA' },
  tdSerial: { width: 40, fontFamily: typography.uiMedium, fontSize: 12, color: '#9CA3AF', paddingHorizontal: 4 },
  td: { fontFamily: typography.uiMedium, fontSize: 13, color: '#374151', paddingHorizontal: 6, paddingVertical: 6, lineHeight: 18 },
  tdNum: { fontFamily: typography.mono, fontSize: 13, color: '#374151', textAlign: 'right', paddingHorizontal: 6, paddingVertical: 6 },
  link: { color: '#2563EB' },
  blue: { color: '#2563EB' },

  // Total row
  totalRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderTopWidth: 1.5, borderTopColor: '#E5E7EB', paddingHorizontal: spacing.lg, minHeight: 38 },
  totalSerial: { width: 40, fontFamily: typography.uiBold, fontSize: 13, color: '#9CA3AF', paddingHorizontal: 4 },
  totalLabel: { fontFamily: typography.uiBold, fontSize: 13, color: '#111827', paddingHorizontal: 6 },
  totalNum: { fontFamily: typography.uiBold, fontSize: 13, color: '#111827', textAlign: 'right', paddingHorizontal: 6, fontVariant: ['tabular-nums'] as any },

  // Pagination
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#E5E7EB', backgroundColor: '#FFFFFF', minHeight: 44 },
  pageInfo: { fontFamily: typography.uiBold, fontSize: 12, color: '#6B7280' },
  pageNav: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  pageBtn: { width: 28, height: 28, borderRadius: 5, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) },
  pageBtnOff: { opacity: 0.3 },
  pageBtnTxt: { fontFamily: typography.uiBold, fontSize: 13, color: '#374151', lineHeight: 16 },
  pageLabel: { paddingHorizontal: 10, height: 28, borderRadius: 5, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', marginHorizontal: 2 },
  pageLabelTxt: { fontFamily: typography.uiBold, fontSize: 11, color: '#374151' },
});
