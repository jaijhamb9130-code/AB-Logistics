import React, { useState, useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import { TextInput } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ReportsStackParamList } from '../navigation/types';
import { Loader } from '../components/Loader';
import { reportService } from '../services/reportService';
import { colors, spacing, typography } from '../constants/theme';
import { getTodayISO } from '../utils/dateUtils';

type Nav = NativeStackNavigationProp<ReportsStackParamList, 'GroupSummary'>;

function fmt(n: any) { return Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }); }

export function GroupSummaryScreen() {
  const navigation = useNavigation<Nav>();
  const today = getTodayISO();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const data = await reportService.getGroupSummary({ from, to });
      setRows(data);
    } catch { setErr('Failed to load report.'); }
    finally { setLoading(false); }
  }, [from, to]);

  const totalDr = (rows ?? []).reduce((s, r) => s + Number(r.debit_total ?? 0), 0);
  const totalCr = (rows ?? []).reduce((s, r) => s + Number(r.credit_total ?? 0), 0);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Group Summary (Trial Balance)</Text>
      </View>

      <View style={styles.filters}>
        <View style={styles.filterRow}>
          <View style={styles.filterField}>
            <Text style={styles.filterLabel}>From</Text>
            {Platform.OS === 'web'
              ? React.createElement('input', { type: 'date', value: from, onChange: (e: any) => setFrom(e.target.value), style: webDateStyle })
              : <TextInput style={styles.input} value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" />}
          </View>
          <View style={styles.filterField}>
            <Text style={styles.filterLabel}>To</Text>
            {Platform.OS === 'web'
              ? React.createElement('input', { type: 'date', value: to, onChange: (e: any) => setTo(e.target.value), style: webDateStyle })
              : <TextInput style={styles.input} value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" />}
          </View>
          <Pressable style={styles.runBtn} onPress={load}>
            <Text style={styles.runBtnText}>Run</Text>
          </Pressable>
        </View>
      </View>

      {loading ? <Loader /> : err ? (
        <Text style={styles.err}>{err}</Text>
      ) : rows === null ? (
        <View style={styles.empty}><Text style={styles.emptyText}>Set date range and press Run</Text></View>
      ) : rows.length === 0 ? (
        <View style={styles.empty}><Text style={styles.emptyText}>No data for this period.</Text></View>
      ) : (
        <ScrollView style={{ flex: 1 }}>
          <View style={styles.thead}>
            <Text style={[styles.th, { flex: 1 }]}>GROUP</Text>
            <Text style={[styles.th, styles.numCol]}>DEBIT</Text>
            <Text style={[styles.th, styles.numCol]}>CREDIT</Text>
            <Text style={[styles.th, { width: 30 }]} />
          </View>
          {rows.map((r, i) => (
            <Pressable
              key={r.group_id}
              style={[styles.trow, i % 2 === 1 && styles.trowAlt]}
              onPress={() => navigation.navigate('GroupLedgers', { group_id: r.group_id, group_name: r.group_name })}
            >
              <Text style={[styles.td, { flex: 1 }]} numberOfLines={1}>{r.group_name}</Text>
              <Text style={[styles.td, styles.num, styles.dr, styles.numCol]}>{r.debit_total > 0 ? fmt(r.debit_total) : '—'}</Text>
              <Text style={[styles.td, styles.num, styles.cr, styles.numCol]}>{r.credit_total > 0 ? fmt(r.credit_total) : '—'}</Text>
              <Text style={[styles.td, { width: 30, color: colors.textMuted }]}>›</Text>
            </Pressable>
          ))}
          <View style={styles.tfoot}>
            <Text style={[styles.tfootLabel, { flex: 1 }]}>TOTAL</Text>
            <Text style={[styles.tfootVal, styles.dr, styles.numCol]}>{fmt(totalDr)}</Text>
            <Text style={[styles.tfootVal, styles.cr, styles.numCol]}>{fmt(totalCr)}</Text>
            <View style={{ width: 30 }} />
          </View>
          <View style={styles.balanceBar}>
            <Text style={styles.balanceText}>
              Difference: {Math.abs(totalDr - totalCr) < 0.01 ? '✓ Balanced' : fmt(Math.abs(totalDr - totalCr))}
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const webDateStyle = { padding: '6px 10px', border: '1px solid #E2E8F0', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', color: '#0F172A', backgroundColor: '#fff' } as any;

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card },
  back: { paddingVertical: 4, paddingHorizontal: 8 },
  backText: { fontFamily: typography.uiMedium, fontSize: 14, color: colors.brandRed },
  title: { fontFamily: typography.uiHeavy, fontSize: 18, color: colors.text },
  filters: { backgroundColor: colors.card, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' },
  filterField: { gap: 4 },
  filterLabel: { fontFamily: typography.uiMedium, fontSize: 11, color: colors.textLabel, textTransform: 'uppercase' },
  input: { height: 34, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 10, fontSize: 13, fontFamily: typography.ui, color: colors.text, backgroundColor: '#fff', minWidth: 120 },
  runBtn: { height: 34, paddingHorizontal: 20, backgroundColor: colors.brandRed, borderRadius: 6, justifyContent: 'center' },
  runBtnText: { fontFamily: typography.uiBold, fontSize: 13, color: '#fff' },
  err: { color: colors.danger, padding: spacing.md },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { fontFamily: typography.ui, fontSize: 14, color: colors.textMuted },
  thead: { flexDirection: 'row', backgroundColor: '#EEF2F7', borderBottomWidth: 1, borderBottomColor: colors.border },
  th: { fontFamily: typography.uiBold, fontSize: 11, color: colors.textLabel, paddingHorizontal: 12, paddingVertical: 8 },
  trow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  trowAlt: { backgroundColor: '#F8FAFC' },
  td: { fontFamily: typography.ui, fontSize: 13, color: colors.text, paddingHorizontal: 12, paddingVertical: 9 },
  num: { textAlign: 'right' },
  numCol: { width: 130 },
  dr: { color: '#DC2626' },
  cr: { color: '#16A34A' },
  tfoot: { flexDirection: 'row', padding: 10, backgroundColor: '#F1F5F9', borderTopWidth: 2, borderTopColor: colors.border },
  tfootLabel: { fontFamily: typography.uiBold, fontSize: 13, color: colors.text, paddingHorizontal: 4 },
  tfootVal: { fontFamily: typography.uiBold, fontSize: 13, width: 130, textAlign: 'right' },
  balanceBar: { padding: 10, backgroundColor: '#ECFDF5', borderTopWidth: 1, borderTopColor: '#A7F3D0' },
  balanceText: { fontFamily: typography.uiMedium, fontSize: 12, color: '#065F46' },
});
