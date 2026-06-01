/**
 * DaybookScreen — all vouchers in a date range with Dr/Cr split per row.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Platform, StyleSheet, Text, View, Pressable, Alert } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { DataTable, type Column } from '../components/DataTable';
import { Loader } from '../components/Loader';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { colors, radius, spacing, text, typography } from '../constants/theme';
import { voucherService } from '../services/voucherService';
import type { DaybookEntry, VoucherDetail } from '../../../shared/types/voucher';
import type { BillingStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import { canDoAction } from '../navigation/guards';

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

function fmtDate(iso: string): string {
  if (!iso) return '—';
  const parts = iso.split('T')[0].split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

export function DaybookScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const initialDate = route.params?.date || todayISO();
  
  const [fromDate, setFromDate] = useState<string>(initialDate);
  const [toDate, setToDate] = useState<string>(initialDate);
  
  const [rows, setRows] = useState<DaybookEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [deleteTarget, setDeleteTarget] = useState<DaybookEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  // View Modal State
  const [viewTargetId, setViewTargetId] = useState<number | null>(null);
  const [viewData, setViewData] = useState<VoucherDetail | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const load = useCallback(() => {
    setError(null);
    setRows(null);
    voucherService.daybook(fromDate, toDate)
      .then(setRows)
      .catch(() => { setError('Could not load daybook.'); setRows([]); });
  }, [fromDate, toDate]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!viewTargetId) {
      setViewData(null);
      return;
    }
    setViewLoading(true);
    voucherService.get(viewTargetId)
      .then(setViewData)
      .catch(() => Alert.alert('Error', 'Could not load voucher details.'))
      .finally(() => setViewLoading(false));
  }, [viewTargetId]);

  const onDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await voucherService.remove(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Could not delete voucher.');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const totals = (rows || []).reduce(
    (acc, r) => ({ dr: acc.dr + Number(r.dr_amount || 0), cr: acc.cr + Number(r.cr_amount || 0) }),
    { dr: 0, cr: 0 }
  );

  const columns: Column<DaybookEntry>[] = [
    { key: 'vch_date', label: 'VCH DATE', width: 130, render: (r) => <Text style={styles.cellText}>{fmtDate(r.vch_date || '')}</Text> },
    { key: 'party_name', label: 'Ledger Name', render: (r) => <Text style={styles.ledgerNameText} numberOfLines={1}>{r.party_name || '—'}</Text> },
    { key: 'vch_no', label: 'VCH NO.', width: 130, render: (r) => <Text style={styles.cellText}>{r.vch_no || '—'}</Text> },
    { key: 'vch_type', label: 'VCH TYPE', width: 130, render: (r) => <Text style={styles.cellText} numberOfLines={1}>{r.vch_type_name || '—'}</Text> },
    { key: 'dr', label: 'DEBIT', width: 110, align: 'right', render: (r) => {
        const v = Number(r.dr_amount || 0);
        if (!v) return <Text style={[styles.numCell, styles.numCellMuted]}>—</Text>;
        return <Text style={[styles.numCell, styles.numCellDr]}>{fmtMoney(r.dr_amount)}</Text>;
    } },
    { key: 'cr', label: 'CREDIT', width: 110, align: 'right', render: (r) => {
        const v = Number(r.cr_amount || 0);
        if (!v) return <Text style={[styles.numCell, styles.numCellMuted]}>—</Text>;
        return <Text style={[styles.numCell, styles.numCellCr]}>{fmtMoney(r.cr_amount)}</Text>;
    } },
    { key: 'actions', label: 'ACTIONS', width: 120, align: 'right', render: (r) => (
        <View style={styles.actionsCell}>
          {/* Daybook entries are voucher records — every action button on
              every row (including bilty-type rows) gates on the voucher.*
              perm family. Daybook.view alone gives read-only access; to
              modify rows, the user needs the matching voucher permission. */}
          {canDoAction(user, 'voucher', 'view') && (
            <Pressable onPress={() => setViewTargetId(r.id)} style={styles.actionBtn}>
              <Text style={[styles.actionIcon, { color: '#3B82F6' }]}>👁</Text>
            </Pressable>
          )}
          {canDoAction(user, 'voucher', 'edit') && (
            <Pressable onPress={() => editEntry(r)} style={styles.actionBtn}>
              <Text style={[styles.actionIcon, { color: '#10B981' }]}>✎</Text>
            </Pressable>
          )}
          {canDoAction(user, 'voucher', 'delete') && (
            <Pressable onPress={() => setDeleteTarget(r)} style={styles.actionBtn}>
              <Text style={[styles.actionIcon, { color: '#EF4444' }]}>🗑</Text>
            </Pressable>
          )}
        </View>
      )
    },
  ];

  // Bilty vouchers don't belong on the generic Voucher form (the Vouchers
  // page hides the "Bilty" type from its right rail entirely). Route them
  // to the dedicated Bilty edit form in the Bilty tab instead. All other
  // voucher types stay on the in-stack VoucherForm.
  const editEntry = (r: DaybookEntry) => {
    const vchType = String(r.vch_type_name || '').toLowerCase();
    if (vchType === 'bilty') {
      (navigation as any).navigate('Bilty', { screen: 'BiltyForm', params: { id: r.id } });
    } else {
      navigation.navigate('VoucherForm', { id: r.id });
    }
  };

  const WebHeader = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
      <h1 style={{ fontSize: 20, margin: 0, fontFamily: typography.uiHeavy, color: colors.textStrong }}>
        Day Book
      </h1>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #CBD5E1', borderRadius: 4, overflow: 'hidden', backgroundColor: '#FFF' }}>
          <div style={{ padding: '0 8px', fontSize: 11, fontWeight: 700, color: '#64748B', display: 'flex', alignItems: 'center', borderRight: '1px solid #CBD5E1' }}>
            <span style={{ marginRight: 4 }}>🗓</span> FROM
          </div>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => { if (e.target.value) setFromDate(e.target.value); }}
            style={{ border: 'none', height: 32, padding: '0 8px', outline: 'none', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #CBD5E1', borderRadius: 4, overflow: 'hidden', backgroundColor: '#FFF' }}>
          <div style={{ padding: '0 8px', fontSize: 11, fontWeight: 700, color: '#64748B', display: 'flex', alignItems: 'center', borderRight: '1px solid #CBD5E1' }}>
            TO
          </div>
          <input
            type="date"
            value={toDate}
            onChange={(e) => { if (e.target.value) setToDate(e.target.value); }}
            style={{ border: 'none', height: 32, padding: '0 8px', outline: 'none', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer' }}
          />
        </div>

        <button
          onClick={() => {
            const t = todayISO();
            setFromDate(t);
            setToDate(t);
          }}
          style={{
            backgroundColor: '#3B82F6', color: '#FFF', border: 'none', borderRadius: 4,
            padding: '0 16px', height: 34, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Today
        </button>
      </div>
    </div>
  );

  // Page-level gate: daybook.view OR voucher.view lets you read the daybook
  // (the daybook is also the natural list-view for vouchers).
  // Row actions (view/edit/delete) require additional voucher.* perms.
  if (
    !canDoAction(user, 'daybook', 'view') &&
    !canDoAction(user, 'voucher', 'view')
  ) {
    return (
      <View style={styles.wrap}>
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>
            You don't have permission to view the daybook.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {Platform.OS === 'web' ? <WebHeader /> : (
        <Text style={[text.heading, { marginBottom: spacing.md }]}>Day Book</Text>
      )}

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
              const vchType = String(r.vch_type_name || '').toLowerCase();
              const canEdit = vchType === 'bilty' 
                ? canDoAction(user, 'bilty', 'edit')
                : canDoAction(user, 'voucher', 'edit');
              
              if (canEdit) {
                editEntry(r);
              } else {
                setViewTargetId(r.id);
              }
            }}
            emptyLabel={`No vouchers found`}
            showSerialNo={false}
          />
          {rows.length >= 0 ? (
            <View style={styles.totalsRow}>
              <View style={styles.totalsLeft}>
                <Text style={styles.totalText}>Total ({rows.length} vouchers)</Text>
              </View>
              <View style={styles.totalsRight}>
                <View style={{ width: 110, alignItems: 'flex-end', paddingRight: spacing.sm }}>
                  <Text style={styles.totalNumText}>{fmtMoney(totals.dr)}</Text>
                </View>
                <View style={{ width: 110, alignItems: 'flex-end', paddingRight: spacing.sm }}>
                  <Text style={styles.totalNumText}>{fmtMoney(totals.cr)}</Text>
                </View>
                <View style={{ width: 120 }} /> {/* Spacer for Actions column */}
              </View>
            </View>
          ) : null}
        </View>
      )}

      <Modal
        visible={!!viewTargetId}
        onClose={() => setViewTargetId(null)}
        title={viewData ? `Voucher Detail — ${viewData.vch_no || ''}` : 'Voucher Detail'}
        maxWidth={700}
      >
        {viewLoading ? (
          <View style={{ height: 200, justifyContent: 'center' }}><Loader /></View>
        ) : viewData ? (
          <View style={styles.viewModalContent}>
            <View style={styles.viewModalHeader}>
              <View style={styles.viewModalHeaderCol}>
                <Text style={styles.viewModalHeaderLabel}>Voucher No.</Text>
                <Text style={styles.viewModalHeaderValue}>{viewData.vch_no || '—'}</Text>
              </View>
              <View style={styles.viewModalHeaderCol}>
                <Text style={styles.viewModalHeaderLabel}>Date</Text>
                <Text style={styles.viewModalHeaderValue}>{fmtDate(viewData.vch_date || '')}</Text>
              </View>
              <View style={styles.viewModalHeaderCol}>
                <Text style={styles.viewModalHeaderLabel}>Party</Text>
                <Text style={styles.viewModalHeaderValue}>{viewData.party_name || '—'}</Text>
              </View>
            </View>

            <Text style={styles.viewModalSectionTitle}>LEDGER ENTRIES</Text>
            
            <View style={styles.viewModalTable}>
              <View style={styles.viewModalTableRowHeader}>
                <Text style={[styles.viewModalTableColH, { flex: 1 }]}>LEDGER</Text>
                <Text style={[styles.viewModalTableColH, { width: 100, textAlign: 'right' }]}>DR</Text>
                <Text style={[styles.viewModalTableColH, { width: 100, textAlign: 'right' }]}>CR</Text>
              </View>

              {viewData.ledgerEntries.map((le, idx) => {
                const amt = Number(le.amount || 0);
                const isDr = amt > 0;
                const isCr = amt < 0;
                const absAmt = Math.abs(amt);
                
                return (
                  <View key={idx}>
                    <View style={styles.viewModalTableRow}>
                      <Text style={[styles.viewModalTableCol, { flex: 1 }]}>{le.ledger_name || '—'}</Text>
                      <Text style={[styles.viewModalTableCol, { width: 100, textAlign: 'right' }, isDr && styles.numCellDr]}>{isDr ? fmtMoney(absAmt) : '—'}</Text>
                      <Text style={[styles.viewModalTableCol, { width: 100, textAlign: 'right' }, isCr && styles.numCellCr]}>{isCr ? fmtMoney(absAmt) : '—'}</Text>
                    </View>
                    {le.inventoryEntries && le.inventoryEntries.map((inv, iIdx) => (
                      <View key={iIdx} style={styles.viewModalInvRow}>
                        <Text style={styles.viewModalInvText}>
                          ↳ {inv.item_name} × {inv.qty} @ ₹{fmtMoney(inv.rate)}   ₹{fmtMoney(inv.amount)}
                        </Text>
                      </View>
                    ))}
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          <View style={{ height: 200, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: colors.textMuted }}>Failed to load data.</Text>
          </View>
        )}
      </Modal>

      <ConfirmDialog
        visible={!!deleteTarget}
        title="Delete Voucher"
        message={deleteTarget ? `Are you sure you want to delete ${deleteTarget.vch_type_name} ${deleteTarget.vch_no}?` : ''}
        confirmLabel="Delete"
        danger
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={onDelete}
      />
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
  
  cellText: { fontSize: 13, color: colors.textMuted, fontFamily: typography.uiMedium },
  ledgerNameText: { fontSize: 15, color: colors.textStrong, fontFamily: typography.uiMedium },
  numCell: { fontSize: 13, color: colors.textStrong, fontFamily: typography.uiMedium },
  // Dr = green, Cr = red — matches the Dr/Cr pill colours used in voucher
  // and ledger forms so the convention reads the same across the app.
  numCellDr: { color: colors.success, fontWeight: '700' },
  numCellCr: { color: colors.brandRed, fontWeight: '700' },
  numCellMuted: { color: colors.textMuted, fontWeight: '400' },
  
  actionsCell: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12, paddingRight: spacing.sm },
  actionBtn: { padding: 4 },
  actionIcon: { fontSize: 16 },

  totalsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: 12,
    backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border,
    borderBottomLeftRadius: radius.md, borderBottomRightRadius: radius.md,
  },
  totalsLeft: { flex: 1 },
  totalsRight: { flexDirection: 'row', alignItems: 'center' },
  totalText: { fontSize: 14, fontFamily: typography.uiBold, color: colors.textStrong },
  totalNumText: { fontSize: 14, fontFamily: typography.uiBold, color: colors.textStrong },

  // View Modal Styles
  viewModalContent: { paddingBottom: spacing.lg },
  viewModalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xl },
  viewModalHeaderCol: { flex: 1 },
  viewModalHeaderLabel: { fontSize: 11, color: colors.textMuted, fontFamily: typography.uiBold, textTransform: 'uppercase', marginBottom: 4 },
  viewModalHeaderValue: { fontSize: 14, color: colors.textStrong, fontFamily: typography.uiBold },
  viewModalSectionTitle: { fontSize: 11, color: colors.textMuted, fontFamily: typography.uiBold, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 },
  viewModalTable: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  viewModalTableRowHeader: { flexDirection: 'row', padding: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.background },
  viewModalTableColH: { fontSize: 11, color: colors.textMuted, fontFamily: typography.uiBold },
  viewModalTableRow: { flexDirection: 'row', padding: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  viewModalTableCol: { fontSize: 13, color: colors.textStrong, fontFamily: typography.ui },
  viewModalInvRow: { paddingLeft: 24, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#F8FAFC' },
  viewModalInvText: { fontSize: 12, color: colors.textMuted, fontFamily: typography.uiMedium },
});
