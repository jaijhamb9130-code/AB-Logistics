import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ReportsStackParamList } from '../navigation/types';
import { Loader } from '../components/Loader';
import { SearchIcon, XIcon, ArrowLeftIcon } from '../components/Icons';
import { reportService } from '../services/reportService';
import { ledgerMasterService } from '../services/ledgerMasterService';
import { colors, spacing, typography } from '../constants/theme';
import { getTodayISO } from '../utils/dateUtils';

type Nav = NativeStackNavigationProp<ReportsStackParamList, 'LedgerStatement'>;

const fmt = (n: any) => Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const fmtDate = (s: string) => {
  if (!s) return '—';
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
};

export function LedgerStatementScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<any>();
  const today = getTodayISO();

  const [ledgerInput, setLedgerInput] = useState('');
  const [ledgerId, setLedgerId] = useState<number | null>(route.params?.ledger_id ?? null);
  const [ledgerName, setLedgerName] = useState<string>(route.params?.ledger_name ?? '');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSugg, setShowSugg] = useState(false);
  const [searching, setSearching] = useState(false);
  const [from, setFrom] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(today);
  const [result, setResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = (q: string) => {
    setLedgerInput(q);
    if (debRef.current) clearTimeout(debRef.current);
    if (q.trim().length < 1) { setSuggestions([]); setShowSugg(false); return; }
    debRef.current = setTimeout(async () => {
      try {
        const all = await ledgerMasterService.search(undefined, q);
        setSuggestions(all.slice(0, 10));
        setShowSugg(all.length > 0);
      } catch { setSuggestions([]); setShowSugg(false); }
    }, 200);
  };

  const pickLedger = (l: any) => {
    setLedgerId(l.id);
    setLedgerName(l.name);
    setLedgerInput('');
    setSuggestions([]);
    setShowSugg(false);
    setSearching(false);
  };

  const clearLedger = () => {
    setLedgerId(null);
    setLedgerName('');
    setResult(null);
    setSearching(true);
    setLedgerInput('');
  };

  const load = useCallback(async (id: number, f: string, t: string) => {
    setLoading(true); setErr(null);
    try {
      const data = await reportService.getLedgerStatement({ ledger_id: id, from: f, to: t });
      setResult(data);
    } catch { setErr('Failed to load statement.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!ledgerId) return;
    if (loadRef.current) clearTimeout(loadRef.current);
    loadRef.current = setTimeout(() => load(ledgerId, from, to), 150);
    return () => { if (loadRef.current) clearTimeout(loadRef.current); };
  }, [ledgerId, from, to]);

  useEffect(() => {
    if (route.params?.ledger_id) {
      setLedgerId(route.params.ledger_id);
      setLedgerName(route.params.ledger_name ?? '');
    }
  }, []);

  const txns = result?.entries ?? [];
  const opening = Number(result?.opening ?? 0);
  let runBal = opening;
  const rows = txns.map((t: any) => {
    const amount = Number(t.amount ?? 0);
    const dr = amount > 0 ? amount : 0;
    const cr = amount < 0 ? Math.abs(amount) : 0;
    runBal = runBal + dr - cr;
    return { ...t, debit: dr, credit: cr };
  });
  const debitTotal = Number(result?.debit_total ?? 0);
  const creditTotal = Number(result?.credit_total ?? 0);
  const closing = runBal;

  return (
    <View style={styles.wrap}>
      {/* ── Top bar ── */}
      <View style={styles.bar}>
        {/* Left: back + title + ledger name */}
        <View style={styles.barLeft}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <ArrowLeftIcon size={14} color={colors.brandRed} />
            <Text style={styles.backTxt}>Back</Text>
          </Pressable>
          <Text style={styles.title}>Ledger Statement</Text>
          {ledgerName && !searching ? (
            <>
              <Text style={styles.ledgerNameBadge}>{ledgerName}</Text>
              <Pressable onPress={clearLedger} style={styles.changeBtn}>
                <XIcon size={12} color="#6B7280" />
                <Text style={styles.changeBtnTxt}>Change</Text>
              </Pressable>
            </>
          ) : null}
        </View>

        {/* Right: search + dates */}
        <View style={styles.barRight}>
          {/* Ledger search */}
          {(!ledgerId || searching) ? (
            <View style={styles.searchWrap}>
              <View style={styles.searchIconWrap} pointerEvents="none">
                <SearchIcon size={14} color="#9CA3AF" />
              </View>
              <TextInput
                autoFocus={searching}
                style={styles.searchInput}
                value={ledgerInput}
                onChangeText={doSearch}
                placeholder="Search ledger..."
                placeholderTextColor="#9CA3AF"
                onBlur={() => setTimeout(() => setShowSugg(false), 180)}
                onFocus={() => { if (suggestions.length > 0) setShowSugg(true); }}
              />
              {showSugg && suggestions.length > 0 && (
                <View style={styles.suggestBox}>
                  {suggestions.map((s) => (
                    <Pressable key={s.id} style={({ pressed }) => [styles.suggestRow, pressed && styles.suggestRowPressed]} onPress={() => pickLedger(s)}>
                      <Text style={styles.suggestName}>{s.name}</Text>
                      {s.city ? <Text style={styles.suggestCity}>{s.city}</Text> : null}
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <Pressable onPress={() => { setSearching(true); }} style={styles.changeLedgerBtn}>
              <SearchIcon size={13} color="#374151" />
              <Text style={styles.changeLedgerTxt}>Change ledger...</Text>
            </Pressable>
          )}

          {/* Date range */}
          <View style={styles.dateGroup}>
            <Text style={styles.dateLabel}>FROM</Text>
            {Platform.OS === 'web'
              ? React.createElement('input', { type: 'date', value: from, onChange: (e: any) => setFrom(e.target.value), style: webDateStyle })
              : <TextInput style={styles.dateInput} value={from} onChangeText={setFrom} />}
            <Text style={styles.dateLabel}>TO</Text>
            {Platform.OS === 'web'
              ? React.createElement('input', { type: 'date', value: to, onChange: (e: any) => setTo(e.target.value), style: webDateStyle })
              : <TextInput style={styles.dateInput} value={to} onChangeText={setTo} />}
          </View>
        </View>
      </View>

      {/* ── Content ── */}
      {loading ? (
        <Loader />
      ) : err ? (
        <Text style={styles.err}>{err}</Text>
      ) : !ledgerId || (!result && !loading) ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No ledger selected</Text>
          <Text style={styles.emptyText}>Use the search box above to find a ledger</Text>
        </View>
      ) : result ? (
        <ScrollView style={{ flex: 1 }}>
          {/* Table header */}
          <View style={styles.thead}>
            <Text style={[styles.th, COL.date]}>VCH DATE</Text>
            <Text style={[styles.th, COL.part]}>PARTICULARS</Text>
            <Text style={[styles.th, COL.vchno]}>VCH NO.</Text>
            <Text style={[styles.th, COL.type]}>VCH TYPE</Text>
            <Text style={[styles.th, styles.right, COL.dr]}>DEBIT</Text>
            <Text style={[styles.th, styles.right, COL.cr]}>CREDIT</Text>
          </View>

          {/* Data rows */}
          {rows.length === 0 ? (
            <View style={styles.emptyInline}><Text style={styles.emptyText}>No transactions in this period.</Text></View>
          ) : rows.map((r: any, i: number) => (
            <View key={i} style={[styles.trow, i % 2 === 1 && styles.trowAlt]}>
              <Text style={[styles.td, COL.date]}>{fmtDate(r.vch_date)}</Text>
              <Text style={[styles.td, { flex: COL.part.flex }]} numberOfLines={1}>{r.particulars || r.remark || '—'}</Text>
              <Text style={[styles.td, styles.link, COL.vchno]} numberOfLines={1}>{r.vch_no || '—'}</Text>
              <Text style={[styles.td, COL.type]} numberOfLines={1}>{r.vch_type_name || '—'}</Text>
              <Text style={[styles.tdNum, styles.drTxt, COL.dr]}>{r.debit > 0 ? fmt(r.debit) : '—'}</Text>
              <Text style={[styles.tdNum, styles.crTxt, COL.cr]}>{r.credit > 0 ? fmt(r.credit) : '—'}</Text>
            </View>
          ))}

          {/* Opening Balance row */}
          <View style={styles.openRow}>
            <Text style={[styles.specialCell, COL.date]}>—</Text>
            <Text style={[styles.specialLabel, { flex: COL.part.flex + COL.vchno.flex + COL.type.flex }]}>Opening Balance</Text>
            <Text style={[styles.specialNum, opening >= 0 ? styles.drTxt : styles.crTxt, COL.dr]}>
              {opening !== 0 ? (opening > 0 ? fmt(opening) : '') : '—'}
            </Text>
            <Text style={[styles.specialNum, opening < 0 ? styles.crTxt : styles.drTxt, COL.cr]}>
              {opening < 0 ? fmt(Math.abs(opening)) : (opening === 0 ? '—' : '')}
            </Text>
          </View>

          {/* Total row */}
          <View style={styles.totalRow}>
            <Text style={[styles.totalCell, COL.date]}>—</Text>
            <Text style={[styles.totalLabel, { flex: COL.part.flex + COL.vchno.flex + COL.type.flex }]}>Total</Text>
            <Text style={[styles.totalNum, styles.drTxt, COL.dr]}>{fmt(debitTotal)}</Text>
            <Text style={[styles.totalNum, styles.crTxt, COL.cr]}>{fmt(creditTotal)}</Text>
          </View>

          {/* Closing Balance row */}
          <View style={styles.closingRow}>
            <Text style={[styles.totalCell, COL.date]}>—</Text>
            <Text style={[styles.closingLabel, { flex: COL.part.flex + COL.vchno.flex + COL.type.flex }]}>Closing Balance</Text>
            <Text style={[styles.closingNum, closing >= 0 ? styles.drTxt : styles.crTxt, { flex: COL.dr.flex + COL.cr.flex, textAlign: 'right', paddingHorizontal: 10 }]}>
              {fmt(Math.abs(closing))} {closing >= 0 ? 'Dr' : 'Cr'}
            </Text>
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

// Column flex definitions — one source of truth
const COL = {
  date:  { flex: 1.0 },
  part:  { flex: 3.5 },
  vchno: { flex: 1.4 },
  type:  { flex: 1.2 },
  dr:    { flex: 1.3 },
  cr:    { flex: 1.3 },
};

const webDateStyle = {
  height: 30, padding: '0 8px', border: '1px solid #E5E7EB', borderRadius: 5,
  fontSize: 12, fontFamily: 'inherit', color: '#111827', backgroundColor: '#fff', outline: 'none',
} as any;

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#FFFFFF' },

  // Top bar
  bar: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12,
    paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
    zIndex: 100, ...(Platform.OS === 'web' ? { overflow: 'visible' } as any : {}),
  },
  barLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  barRight: { flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 100, ...(Platform.OS === 'web' ? { overflow: 'visible' } as any : {}) },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 2 },
  backTxt: { fontFamily: typography.uiMedium, fontSize: 13, color: colors.brandRed },
  title: { fontFamily: typography.uiHeavy, fontSize: 17, color: '#111827', letterSpacing: -0.3 },
  ledgerNameBadge: { fontFamily: typography.uiBold, fontSize: 14, color: '#2563EB', marginLeft: 4 },
  changeBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 5, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  changeBtnTxt: { fontFamily: typography.uiMedium, fontSize: 12, color: '#6B7280' },

  // Ledger search
  searchWrap: { position: 'relative', zIndex: 200, ...(Platform.OS === 'web' ? { overflow: 'visible' } as any : {}) },
  searchIconWrap: { position: 'absolute', left: 9, top: 0, bottom: 0, justifyContent: 'center', zIndex: 1 },
  searchInput: {
    height: 32, borderWidth: 1, borderColor: '#2563EB', borderRadius: 6,
    paddingLeft: 30, paddingRight: 10,
    fontSize: 13, fontFamily: typography.uiMedium, color: '#111827',
    backgroundColor: '#EFF6FF', minWidth: 220,
  },
  suggestBox: {
    position: 'absolute', top: 35, left: 0, minWidth: 250, zIndex: 9999,
    backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 4px 20px rgba(0,0,0,0.13)' } as any
      : { elevation: 12, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12 }),
  },
  suggestRow: { paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  suggestRowPressed: { backgroundColor: '#F3F4F6' },
  suggestName: { fontFamily: typography.uiMedium, fontSize: 13, color: '#111827' },
  suggestCity: { fontFamily: typography.ui, fontSize: 11, color: '#6B7280' },

  changeLedgerBtn: { height: 32, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB', flexDirection: 'row', alignItems: 'center', gap: 7 },
  changeLedgerTxt: { fontFamily: typography.uiMedium, fontSize: 12, color: '#374151' },

  dateGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateLabel: { fontFamily: typography.uiBold, fontSize: 10, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.4 },
  dateInput: { height: 30, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 5, paddingHorizontal: 8, fontSize: 12, fontFamily: typography.uiMedium, color: '#111827', backgroundColor: '#fff', minWidth: 100 },

  err: { color: colors.danger, padding: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  emptyTitle: { fontFamily: typography.uiBold, fontSize: 15, color: '#374151' },
  emptyText: { fontFamily: typography.uiMedium, fontSize: 13, color: '#9CA3AF' },
  emptyInline: { paddingVertical: 40, alignItems: 'center' },
  right: { textAlign: 'right' },

  // Table
  thead: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F3F4F6', borderBottomWidth: 1.5, borderBottomColor: '#E5E7EB',
    paddingHorizontal: 16, minHeight: 34,
  },
  th: { fontFamily: typography.uiBold, fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.3, paddingHorizontal: 8, paddingVertical: 6 },

  trow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingHorizontal: 16, minHeight: 36 },
  trowAlt: { backgroundColor: '#FAFAFA' },
  td: { fontFamily: typography.uiMedium, fontSize: 13, color: '#374151', paddingHorizontal: 8, paddingVertical: 5, lineHeight: 18 },
  tdNum: { fontFamily: typography.mono, fontSize: 13, textAlign: 'right', paddingHorizontal: 8, paddingVertical: 5 },
  link: { color: '#2563EB' },
  drTxt: { color: '#2563EB' },   // Debit = blue (money owed/spent)
  crTxt: { color: '#16A34A' },   // Credit = green

  // Opening Balance row — yellow tint
  openRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFBEB', borderBottomWidth: 1, borderBottomColor: '#FDE68A', paddingHorizontal: 16, minHeight: 36 },
  specialCell: { fontFamily: typography.uiBold, fontSize: 12, color: '#9CA3AF', paddingHorizontal: 8, fontStyle: 'italic' },
  specialLabel: { fontFamily: typography.uiBold, fontSize: 13, color: '#92400E', paddingHorizontal: 8, fontStyle: 'italic' },
  specialNum: { fontFamily: typography.uiBold, fontSize: 13, textAlign: 'right', paddingHorizontal: 8 },

  // Total row — gray
  totalRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', borderTopWidth: 1.5, borderTopColor: '#CBD5E1', borderBottomWidth: 1, borderBottomColor: '#CBD5E1', paddingHorizontal: 16, minHeight: 36 },
  totalCell: { fontFamily: typography.uiBold, fontSize: 12, color: '#9CA3AF', paddingHorizontal: 8 },
  totalLabel: { fontFamily: typography.uiBold, fontSize: 13, color: '#111827', paddingHorizontal: 8 },
  totalNum: { fontFamily: typography.uiBold, fontSize: 13, textAlign: 'right', paddingHorizontal: 8 },

  // Closing Balance row — darker gray
  closingRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E2E8F0', borderBottomWidth: 1, borderBottomColor: '#CBD5E1', paddingHorizontal: 16, minHeight: 38 },
  closingLabel: { fontFamily: typography.uiHeavy, fontSize: 13, color: '#0F172A', paddingHorizontal: 8, fontStyle: 'italic' },
  closingNum: { fontFamily: typography.uiHeavy, fontSize: 14 },
});
