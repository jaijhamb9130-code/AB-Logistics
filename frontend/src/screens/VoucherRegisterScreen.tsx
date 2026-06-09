import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Loader } from '../components/Loader';
import { reportService } from '../services/reportService';
import { vchTypeService } from '../services/vchTypeService';
import { colors, spacing, typography } from '../constants/theme';
import { getTodayISO } from '../utils/dateUtils';

const PAGE_SIZE = 10;
const fmt = (n: any) => Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const fmtDate = (s: string) => {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

type SortKey = 'vch_date' | 'vch_no' | 'vch_type_name' | 'party_name' | 'remark' | 'dr_amount' | 'cr_amount';

function sortRows(rows: any[], key: SortKey, dir: 'asc' | 'desc') {
  return [...rows].sort((a, b) => {
    const av = a[key] ?? '';
    const bv = b[key] ?? '';
    const n = ['dr_amount', 'cr_amount'].includes(key);
    const cmp = n ? Number(av) - Number(bv) : String(av).localeCompare(String(bv));
    return dir === 'asc' ? cmp : -cmp;
  });
}

export function VoucherRegisterScreen() {
  const navigation = useNavigation();
  const today = getTodayISO();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [search, setSearch] = useState('');
  const [vchTypes, setVchTypes] = useState<any[]>([]);
  const [selType, setSelType] = useState<string>('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>('vch_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    vchTypeService.list().then((all) => setVchTypes(all)).catch(() => {});
  }, []);

  const load = useCallback(async (f: string, t: string, vt: string, s: string) => {
    setLoading(true); setErr(null);
    try {
      const data = await reportService.getVoucherRegister({ from: f, to: t, vch_type_id: vt || undefined, search: s || undefined });
      setRows(data ?? []);
      setPage(0);
    } catch { setErr('Failed to load.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => load(from, to, selType, search), 200);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [from, to, selType, search]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(0);
  };

  const sorted = sortRows(rows, sortKey, sortDir);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(curPage * PAGE_SIZE, (curPage + 1) * PAGE_SIZE);
  const totalDr = rows.reduce((s, r) => s + Number(r.dr_amount ?? 0), 0);
  const totalCr = rows.reduce((s, r) => s + Number(r.cr_amount ?? 0), 0);

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
          <Text style={styles.title}>Voucher Register</Text>
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
            <Text style={styles.filterLabel}>VOUCHER TYPE</Text>
            {Platform.OS === 'web' ? (
              React.createElement('select', {
                value: selType,
                onChange: (e: any) => setSelType(e.target.value),
                style: { ...webInputStyle, minWidth: 130 },
              }, [
                React.createElement('option', { key: '', value: '' }, 'All types'),
                ...vchTypes.map((t) => React.createElement('option', { key: t.id, value: String(t.id) }, t.name)),
              ])
            ) : (
              <TextInput style={styles.input} value={selType} onChangeText={setSelType} placeholder="All types" placeholderTextColor="#9CA3AF" />
            )}
          </View>
          <View style={styles.filterField}>
            <Text style={styles.filterLabel}>SEARCH PARTY</Text>
            <TextInput style={styles.input} value={search} onChangeText={setSearch} placeholder="Party name..." placeholderTextColor="#9CA3AF" />
          </View>
        </View>
      </View>

      {/* Summary bar */}
      {!loading && !err && (
        <View style={styles.summaryBar}>
          <View style={styles.summaryChip}>
            <Text style={styles.summaryLabel}>TOTAL DR</Text>
            <Text style={[styles.summaryValue, { color: '#DC2626' }]}>{fmt(totalDr)}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryChip}>
            <Text style={styles.summaryLabel}>TOTAL CR</Text>
            <Text style={[styles.summaryValue, { color: '#16A34A' }]}>{fmt(totalCr)}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryChip}>
            <Text style={styles.summaryLabel}>VOUCHERS</Text>
            <Text style={[styles.summaryValue, { color: '#111827' }]}>{rows.length}</Text>
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
              <Text style={styles.thSerial}>#</Text>
              <Pressable style={{ flex: 1.1 }} onPress={() => handleSort('vch_date')}>
                <Text style={hStyle('vch_date')}>DATE{arrow('vch_date')}</Text>
              </Pressable>
              <Pressable style={{ flex: 1.3 }} onPress={() => handleSort('vch_no')}>
                <Text style={hStyle('vch_no')}>VCH NO{arrow('vch_no')}</Text>
              </Pressable>
              <Pressable style={{ flex: 1 }} onPress={() => handleSort('vch_type_name')}>
                <Text style={hStyle('vch_type_name')}>TYPE{arrow('vch_type_name')}</Text>
              </Pressable>
              <Pressable style={{ flex: 1.8 }} onPress={() => handleSort('party_name')}>
                <Text style={hStyle('party_name')}>PARTY{arrow('party_name')}</Text>
              </Pressable>
              <Pressable style={{ flex: 2 }} onPress={() => handleSort('remark')}>
                <Text style={hStyle('remark')}>NARRATION{arrow('remark')}</Text>
              </Pressable>
              <Pressable style={{ flex: 1.2 }} onPress={() => handleSort('dr_amount')}>
                <Text style={[...hStyle('dr_amount'), styles.right]}>DEBIT{arrow('dr_amount')}</Text>
              </Pressable>
              <Pressable style={{ flex: 1.2 }} onPress={() => handleSort('cr_amount')}>
                <Text style={[...hStyle('cr_amount'), styles.right]}>CREDIT{arrow('cr_amount')}</Text>
              </Pressable>
            </View>

            {rows.length === 0 ? (
              <View style={styles.empty}><Text style={styles.emptyText}>No vouchers found for this range.</Text></View>
            ) : pageRows.map((r, i) => (
              <View key={r.id} style={[styles.trow, i % 2 === 1 && styles.trowAlt]}>
                <Text style={styles.tdSerial}>{curPage * PAGE_SIZE + i + 1}</Text>
                <Text style={[styles.td, { flex: 1.1 }]}>{fmtDate(r.vch_date)}</Text>
                <Text style={[styles.td, styles.link, { flex: 1.3 }]} numberOfLines={1}>{r.vch_no || '—'}</Text>
                <Text style={[styles.td, { flex: 1 }]} numberOfLines={1}>{r.vch_type_name || '—'}</Text>
                <Text style={[styles.td, { flex: 1.8 }]} numberOfLines={1}>{r.party_name || '—'}</Text>
                <Text style={[styles.td, { flex: 2 }]} numberOfLines={1}>{r.remark || '—'}</Text>
                <Text style={[styles.tdNum, styles.drAmt, { flex: 1.2 }]}>{Number(r.dr_amount) > 0 ? fmt(r.dr_amount) : ''}</Text>
                <Text style={[styles.tdNum, styles.crAmt, { flex: 1.2 }]}>{Number(r.cr_amount) > 0 ? fmt(r.cr_amount) : ''}</Text>
              </View>
            ))}

            {/* Total row */}
            {rows.length > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalSerial}>—</Text>
                <Text style={[styles.totalLabel, { flex: 7.2 }]}>Total ({rows.length} vouchers)</Text>
                <Text style={[styles.totalNum, styles.drAmt, { flex: 1.2 }]}>{fmt(totalDr)}</Text>
                <Text style={[styles.totalNum, styles.crAmt, { flex: 1.2 }]}>{fmt(totalCr)}</Text>
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

  header: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingHorizontal: spacing.lg, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, marginRight: 'auto' as any },
  backText: { fontFamily: typography.uiMedium, fontSize: 13, color: colors.brandRed },
  title: { fontFamily: typography.uiHeavy, fontSize: 18, color: '#111827', letterSpacing: -0.3 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' },
  filterField: { gap: 2 },
  filterLabel: { fontFamily: typography.uiBold, fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { height: 32, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 6, paddingHorizontal: 9, fontSize: 12, fontFamily: typography.uiMedium, color: '#111827', backgroundColor: '#fff', minWidth: 110 },

  summaryBar: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: 8 },
  summaryChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 4 },
  summaryDivider: { width: 1, height: 20, backgroundColor: '#E5E7EB' },
  summaryLabel: { fontFamily: typography.uiBold, fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue: { fontFamily: typography.uiHeavy, fontSize: 15, letterSpacing: -0.2 },

  err: { color: colors.danger, padding: spacing.md },
  empty: { padding: 48, alignItems: 'center' },
  emptyText: { fontFamily: typography.uiMedium, fontSize: 13, color: '#9CA3AF' },

  thead: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderBottomWidth: 1.5, borderBottomColor: '#E5E7EB', paddingHorizontal: spacing.lg, minHeight: 36 },
  thSerial: { width: 40, fontFamily: typography.uiBold, fontSize: 11, color: '#9CA3AF', paddingHorizontal: 4 },
  th: { fontFamily: typography.uiBold, fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.3, paddingHorizontal: 6, paddingVertical: 8, ...(Platform.OS === 'web' ? { cursor: 'pointer', userSelect: 'none' } as any : {}) },
  thSorted: { color: '#111827' },
  right: { textAlign: 'right' },

  trow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingHorizontal: spacing.lg, minHeight: 38 },
  trowAlt: { backgroundColor: '#FAFAFA' },
  tdSerial: { width: 40, fontFamily: typography.uiMedium, fontSize: 12, color: '#9CA3AF', paddingHorizontal: 4 },
  td: { fontFamily: typography.uiMedium, fontSize: 13, color: '#374151', paddingHorizontal: 6, paddingVertical: 6, lineHeight: 18 },
  tdNum: { textAlign: 'right', fontFamily: typography.mono, fontSize: 13, paddingHorizontal: 6, paddingVertical: 6 },
  link: { color: '#2563EB' },
  drAmt: { color: '#DC2626' },
  crAmt: { color: '#16A34A' },

  totalRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderTopWidth: 1.5, borderTopColor: '#E5E7EB', paddingHorizontal: spacing.lg, minHeight: 38 },
  totalSerial: { width: 40, fontFamily: typography.uiBold, fontSize: 13, color: '#9CA3AF', paddingHorizontal: 4 },
  totalLabel: { fontFamily: typography.uiBold, fontSize: 13, color: '#111827', paddingHorizontal: 6 },
  totalNum: { fontFamily: typography.uiBold, fontSize: 13, textAlign: 'right', paddingHorizontal: 6, fontVariant: ['tabular-nums'] as any },

  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#E5E7EB', backgroundColor: '#FFFFFF', minHeight: 44 },
  pageInfo: { fontFamily: typography.uiBold, fontSize: 12, color: '#6B7280' },
  pageNav: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  pageBtn: { width: 28, height: 28, borderRadius: 5, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}) },
  pageBtnOff: { opacity: 0.3 },
  pageBtnTxt: { fontFamily: typography.uiBold, fontSize: 13, color: '#374151', lineHeight: 16 },
  pageLabel: { paddingHorizontal: 10, height: 28, borderRadius: 5, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', marginHorizontal: 2 },
  pageLabelTxt: { fontFamily: typography.uiBold, fontSize: 11, color: '#374151' },
});
