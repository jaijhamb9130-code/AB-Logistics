/**
 * DaybookScreen — all vouchers in a date range, Tally/Zoho-style.
 *
 * Layout: sortable column headers, a Filters modal, a working refresh control,
 * 15-rows-per-page pagination, a grand-total row (over the *filtered* set) and
 * a "Showing X–Y of N / Page p of q" pager. Filtering, sorting and paging are
 * all client-side over the full range fetched from /api/vouchers/daybook.
 *
 * VCH DATE sorting: toggles asc/desc. Within a single day rows keep their
 * natural create/update order (GREATEST(created_at, updated_at)); across days
 * the date drives the order — so 01-Apr…05-Jun ascending shows the oldest day
 * first, descending shows the newest first.
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Platform, StyleSheet, Text, View, Pressable, TextInput, Alert } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Loader } from '../components/Loader';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { Toast } from '../components/Toast';
import { colors, radius, spacing, typography } from '../constants/theme';
import { voucherService } from '../services/voucherService';
import type { DaybookEntry, VoucherDetail } from '../../../shared/types/voucher';
import type { BillingStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import { canDoAction } from '../navigation/guards';

type Nav = NativeStackNavigationProp<BillingStackParamList, 'Daybook'>;
type Route = RouteProp<BillingStackParamList, 'Daybook'>;

const PAGE_SIZE = 10;
const LINK = '#2563EB';
const HEADER_BG = '#EEF2F7';

type SortKey = 'vch_date' | 'party_name' | 'vch_no' | 'vch_type' | 'debit' | 'credit';
type SortDir = 'asc' | 'desc';

interface Filters {
  search: string;
  party: string;
  vchNo: string;
  vchType: string;
  debitMin: string;
  debitMax: string;
  creditMin: string;
  creditMax: string;
}

const EMPTY_FILTERS: Filters = {
  search: '', party: '', vchNo: '', vchType: '',
  debitMin: '', debitMax: '', creditMin: '', creditMax: '',
};

function num(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtMoney(v: number | string): string {
  const n = num(v);
  if (n === 0) return '—';
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

// Latest activity timestamp = GREATEST(created_at, updated_at), mirrored from
// the backend daybook ORDER BY so same-day rows sort identically client-side.
function activity(r: DaybookEntry): number {
  const c = r.created_at ? Date.parse(r.created_at) : 0;
  const u = r.updated_at ? Date.parse(r.updated_at) : 0;
  return Math.max(Number.isFinite(c) ? c : 0, Number.isFinite(u) ? u : 0);
}

function dateOnly(iso: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso.split('T')[0]);
  return Number.isFinite(t) ? t : 0;
}

function matchesFilters(r: DaybookEntry, f: Filters): boolean {
  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = `${r.vch_no || ''} ${r.party_name || ''} ${r.remark || ''}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (f.party && !String(r.party_name || '').toLowerCase().includes(f.party.toLowerCase())) return false;
  if (f.vchNo && !String(r.vch_no || '').toLowerCase().includes(f.vchNo.toLowerCase())) return false;
  if (f.vchType && !String(r.vch_type_name || '').toLowerCase().includes(f.vchType.toLowerCase())) return false;
  const dr = num(r.dr_amount);
  const cr = num(r.cr_amount);
  if (f.debitMin && dr < num(f.debitMin)) return false;
  if (f.debitMax && dr > num(f.debitMax)) return false;
  if (f.creditMin && cr < num(f.creditMin)) return false;
  if (f.creditMax && cr > num(f.creditMax)) return false;
  return true;
}

// Web-only inline icon (no icon lib installed). Native falls back to a glyph.
function Icon({ kind, color, size = 16 }: { kind: 'edit' | 'trash' | 'refresh' | 'filter'; color: string; size?: number }) {
  if (Platform.OS !== 'web') {
    const glyph = kind === 'edit' ? '✎' : kind === 'trash' ? '🗑' : kind === 'refresh' ? '⟳' : '⛃';
    return <Text style={{ color, fontSize: size }}>{glyph}</Text>;
  }
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (kind === 'edit') {
    return (<svg {...common}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>);
  }
  if (kind === 'trash') {
    return (<svg {...common}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>);
  }
  if (kind === 'refresh') {
    return (<svg {...common}><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>);
  }
  return (<svg {...common}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>);
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

  const [sortKey, setSortKey] = useState<SortKey>('vch_date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);     // applied
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);         // modal draft
  const [filterOpen, setFilterOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<DaybookEntry | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [viewTargetId, setViewTargetId] = useState<number | null>(null);
  const [viewData, setViewData] = useState<VoucherDetail | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const n = route.params?.notice;
    if (!n) return;
    setNotice(n);
    navigation.setParams({ notice: undefined } as any);
  }, [route.params?.notice, navigation]);

  const load = useCallback(() => {
    setError(null);
    setRows(null);
    voucherService.daybook(fromDate, toDate)
      .then(setRows)
      .catch(() => { setError('Could not load daybook.'); setRows([]); });
  }, [fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  // Any change to the data view resets to the first page.
  useEffect(() => { setPage(1); }, [filters, sortKey, sortDir, rows]);

  useEffect(() => {
    if (!viewTargetId) { setViewData(null); return; }
    setViewLoading(true);
    voucherService.get(viewTargetId)
      .then(setViewData)
      .catch((err: any) => {
        // Row points at a voucher that no longer exists — refresh the list.
        if (err?.response?.status === 404) {
          setViewTargetId(null);
          setNotice('That voucher no longer exists. The list has been refreshed.');
          load();
        } else {
          Alert.alert('Error', 'Could not load voucher details.');
        }
      })
      .finally(() => setViewLoading(false));
  }, [viewTargetId, load]);

  // ── Derived view: filter → sort → paginate ────────────────────────────────
  const filtered = useMemo(
    () => (rows || []).filter((r) => matchesFilters(r, filters)),
    [rows, filters],
  );

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const arr = filtered.slice();
    arr.sort((a, b) => {
      let r = 0;
      switch (sortKey) {
        case 'vch_date': {
          r = dateOnly(a.vch_date) - dateOnly(b.vch_date);
          if (r === 0) r = activity(a) - activity(b);
          if (r === 0) r = a.id - b.id;
          break;
        }
        case 'party_name':
          r = String(a.party_name || '').localeCompare(String(b.party_name || ''));
          break;
        case 'vch_no':
          r = String(a.vch_no || '').localeCompare(String(b.vch_no || ''), undefined, { numeric: true });
          break;
        case 'vch_type':
          r = String(a.vch_type_name || '').localeCompare(String(b.vch_type_name || ''));
          break;
        case 'debit':
          r = num(a.dr_amount) - num(b.dr_amount);
          break;
        case 'credit':
          r = num(a.cr_amount) - num(b.cr_amount);
          break;
      }
      if (r === 0) r = a.id - b.id;
      return r * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(start, start + PAGE_SIZE);
  const showingFrom = total === 0 ? 0 : start + 1;
  const showingTo = Math.min(start + PAGE_SIZE, total);

  const totals = useMemo(
    () => filtered.reduce((acc, r) => ({ dr: acc.dr + num(r.dr_amount), cr: acc.cr + num(r.cr_amount) }), { dr: 0, cr: 0 }),
    [filtered],
  );

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((v) => String(v).trim() !== '').length,
    [filters],
  );

  // "Today" glows blue whenever the range has moved off the current day.
  const isToday = fromDate === todayISO() && toDate === todayISO();
  const goToday = () => { const t = todayISO(); setFromDate(t); setToDate(t); };

  // ── Actions ────────────────────────────────────────────────────────────────
  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'vch_date' ? 'desc' : 'asc');
    }
  };

  // Bilty rows edit the Bilty vch type in place; everything else edits by id.
  const editEntry = (r: DaybookEntry) => {
    const vchType = String(r.vch_type_name || '').toLowerCase();
    const subType = String(r.vch_subtype_name || '').toLowerCase();
    const isBilty = vchType === 'bilty' || subType === 'bilty';

    if (isBilty) {
      navigation.navigate('VoucherForm', { biltyEditId: r.id });
    } else {
      navigation.navigate('VoucherForm', { id: r.id });
    }
  };

  const canEditRow = (r: DaybookEntry) => {
    const isBilty = String(r.vch_type_name || '').toLowerCase() === 'bilty';
    return isBilty ? canDoAction(user, 'bilty', 'edit') : canDoAction(user, 'voucher', 'edit');
  };

  // Clicking the VCH NO link opens the voucher — edit when allowed, else view.
  const openEntry = (r: DaybookEntry) => {
    if (canEditRow(r)) editEntry(r);
    else setViewTargetId(r.id);
  };

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

  const openFilters = () => { setDraft(filters); setFilterOpen(true); };
  const applyFilters = () => { setFilters(draft); setFilterOpen(false); };
  const resetFilters = () => { setDraft(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); };

  const showEdit = canDoAction(user, 'voucher', 'edit');
  const showDelete = canDoAction(user, 'voucher', 'delete');

  // ── Header (web) ────────────────────────────────────────────────────────────
  const WebHeader = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
      <h1 style={{ fontSize: 20, margin: 0, fontFamily: typography.uiHeavy, color: colors.textStrong }}>Day Book</h1>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={openFilters} style={btnGhost}>
          <Icon kind="filter" color={colors.textLabel} size={14} />
          <span style={{ marginLeft: 6 }}>Filter</span>
          {activeFilterCount ? <span style={filterBadge}>{activeFilterCount}</span> : null}
        </button>

        <div style={dateGroup}>
          <div style={dateLabel}><span style={{ marginRight: 4 }}>🗓</span> FROM</div>
          <input type="date" value={fromDate} onChange={(e) => { if (e.target.value) setFromDate(e.target.value); }} style={dateInput} />
        </div>

        <div style={dateGroup}>
          <div style={dateLabel}>TO</div>
          <input type="date" value={toDate} onChange={(e) => { if (e.target.value) setToDate(e.target.value); }} style={dateInput} />
        </div>

        <button onClick={goToday} style={{ ...btnGhost, ...(isToday ? {} : btnTodayActive) }}>Today</button>

        {activeFilterCount ? (
          <button onClick={resetFilters} style={btnGhost}>
            <span style={{ marginRight: 6, fontSize: 15, lineHeight: 1 }}>×</span> Clear filters
          </button>
        ) : null}

        <button onClick={load} title="Refresh" style={{ ...btnGhost, padding: '0 10px' }}>
          <Icon kind="refresh" color={colors.textLabel} size={15} />
        </button>
      </div>
    </div>
  );

  // ── Page-level permission gate ──────────────────────────────────────────────
  if (!canDoAction(user, 'daybook', 'view') && !canDoAction(user, 'voucher', 'view')) {
    return (
      <View style={styles.wrap}>
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>You don't have permission to view the daybook.</Text>
        </View>
      </View>
    );
  }

  const SortCaret = ({ col }: { col: SortKey }) => {
    const active = sortKey === col;
    return (
      <Text style={[styles.caret, active && styles.caretActive]}>
        {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
      </Text>
    );
  };

  const HeaderCell = ({ col, label, cellStyle, align }: { col: SortKey; label: string; cellStyle: any; align?: 'right' }) => (
    <Pressable onPress={() => toggleSort(col)} style={[cellStyle, styles.headerCell, align === 'right' && styles.headerCellRight]}>
      <Text style={styles.headerText}>{label}</Text>
      <SortCaret col={col} />
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      <Toast message={notice} onDone={() => setNotice(null)} />

      {Platform.OS === 'web' ? <WebHeader /> : (
        <View style={styles.nativeHeader}>
          <Text style={styles.nativeTitle}>Day Book</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={openFilters} style={styles.nativeBtn}><Text style={styles.nativeBtnText}>Filter{activeFilterCount ? ` (${activeFilterCount})` : ''}</Text></Pressable>
            <Pressable onPress={goToday} style={[styles.nativeBtn, !isToday && styles.nativeBtnActive]}><Text style={[styles.nativeBtnText, !isToday && styles.nativeBtnTextActive]}>Today</Text></Pressable>
            {activeFilterCount ? <Pressable onPress={resetFilters} style={styles.nativeBtn}><Text style={styles.nativeBtnText}>× Clear filters</Text></Pressable> : null}
            <Pressable onPress={load} style={styles.nativeBtn}><Icon kind="refresh" color={colors.textLabel} size={15} /></Pressable>
          </View>
        </View>
      )}

      {error ? (
        <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text></View>
      ) : null}

      {rows === null ? (
        <Loader />
      ) : (
        <View style={styles.tableWrap}>
          {/* Header */}
          <View style={styles.headerRow}>
            <HeaderCell col="vch_date" label="VCH DATE" cellStyle={styles.colDate} />
            <HeaderCell col="party_name" label="LEDGER NAME" cellStyle={styles.colParty} />
            <HeaderCell col="vch_no" label="VCH NO." cellStyle={styles.colVchNo} />
            <HeaderCell col="vch_type" label="VCH TYPE" cellStyle={styles.colType} />
            <HeaderCell col="debit" label="DEBIT" cellStyle={styles.colNum} align="right" />
            <HeaderCell col="credit" label="CREDIT" cellStyle={styles.colNum} align="right" />
            <View style={[styles.colAction, styles.headerCell, styles.headerCellRight]}><Text style={styles.headerText}>ACTION</Text></View>
          </View>

          {/* Body */}
          <View style={styles.body}>
            {pageRows.length === 0 ? (
              <View style={styles.emptyRow}><Text style={styles.muted}>No vouchers found</Text></View>
            ) : pageRows.map((r, idx) => {
              const dr = num(r.dr_amount);
              const cr = num(r.cr_amount);
              return (
                <View
                  key={r.id}
                  {...(Platform.OS === 'web'
                    ? ({ onMouseEnter: () => setHoveredId(r.id), onMouseLeave: () => setHoveredId((h) => (h === r.id ? null : h)) } as any)
                    : {})}
                  style={[styles.row, idx % 2 === 1 && styles.rowAlt, hoveredId === r.id && styles.rowHover]}
                >
                  <View style={styles.colDate}><Text style={styles.dateText}>{fmtDate(r.vch_date || '')}</Text></View>
                  <View style={styles.colParty}><Text style={styles.partyText} numberOfLines={1}>{r.party_name || '—'}</Text></View>
                  <View style={styles.colVchNo}>
                    {r.vch_no ? (
                      <Pressable onPress={() => openEntry(r)}><Text style={styles.linkText} numberOfLines={1}>{r.vch_no}</Text></Pressable>
                    ) : <Text style={styles.muted}>—</Text>}
                  </View>
                  <View style={styles.colType}><Text style={styles.typeText} numberOfLines={1}>{r.vch_type_name || '—'}</Text></View>
                  <View style={[styles.colNum, styles.cellRight]}><Text style={styles.amountText}>{fmtMoney(dr)}</Text></View>
                  <View style={[styles.colNum, styles.cellRight]}><Text style={styles.amountText}>{fmtMoney(cr)}</Text></View>
                  <View style={[styles.colAction, styles.actionCell]}>
                    {showEdit ? (
                      <Pressable onPress={() => editEntry(r)} style={styles.iconBtn} accessibilityLabel="Edit">
                        <Icon kind="edit" color={colors.textLabel} />
                      </Pressable>
                    ) : null}
                    {showDelete ? (
                      <Pressable onPress={() => setDeleteTarget(r)} style={styles.iconBtn} accessibilityLabel="Delete">
                        <Icon kind="trash" color={colors.danger} />
                      </Pressable>
                    ) : null}
                    {!showEdit && !showDelete ? <Text style={styles.muted}>—</Text> : null}
                  </View>
                </View>
              );
            })}
          </View>

          {/* Grand totals (over the full filtered set) */}
          <View style={styles.totalsRow}>
            <View style={styles.totalsLabelCell}><Text style={styles.totalsLabel}>Total ({total} vouchers)</Text></View>
            <View style={[styles.colNum, styles.cellRight]}><Text style={styles.totalsNum}>{fmtMoney(totals.dr)}</Text></View>
            <View style={[styles.colNum, styles.cellRight]}><Text style={styles.totalsNum}>{fmtMoney(totals.cr)}</Text></View>
            <View style={styles.colAction} />
          </View>

          {/* Pager */}
          <View style={styles.pageBar}>
            <Text style={styles.pageInfo}>Showing {showingFrom}–{showingTo} of {total} vouchers</Text>
            <View style={styles.pageNav}>
              <Pressable
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                style={[styles.pageArrow, safePage <= 1 && styles.pageArrowDisabled]}
              >
                <Text style={styles.pageArrowText}>‹</Text>
              </Pressable>
              <Text style={styles.pageText}>Page {safePage} of {totalPages}</Text>
              <Pressable
                onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                style={[styles.pageArrow, safePage >= totalPages && styles.pageArrowDisabled]}
              >
                <Text style={styles.pageArrowText}>›</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* Filters modal */}
      <Modal visible={filterOpen} onClose={() => setFilterOpen(false)} title="Filters" maxWidth={560}>
        <View style={{ gap: spacing.md }}>
          <Field label="SEARCH" placeholder="Vch no / ledger / remark..." value={draft.search} onChange={(v) => setDraft({ ...draft, search: v })} />
          <Field label="LEDGER NAME" placeholder="Ledger name..." value={draft.party} onChange={(v) => setDraft({ ...draft, party: v })} />
          <View style={styles.fieldRow}>
            <Field label="VCH NO." placeholder="filter no..." value={draft.vchNo} onChange={(v) => setDraft({ ...draft, vchNo: v })} half />
            <Field label="VCH TYPE" placeholder="filter type..." value={draft.vchType} onChange={(v) => setDraft({ ...draft, vchType: v })} half />
          </View>
          <View>
            <Text style={styles.fieldLabel}>DEBIT RANGE</Text>
            <View style={styles.fieldRow}>
              <Field placeholder="min" value={draft.debitMin} onChange={(v) => setDraft({ ...draft, debitMin: v })} half keyboard />
              <Field placeholder="max" value={draft.debitMax} onChange={(v) => setDraft({ ...draft, debitMax: v })} half keyboard />
            </View>
          </View>
          <View>
            <Text style={styles.fieldLabel}>CREDIT RANGE</Text>
            <View style={styles.fieldRow}>
              <Field placeholder="min" value={draft.creditMin} onChange={(v) => setDraft({ ...draft, creditMin: v })} half keyboard />
              <Field placeholder="max" value={draft.creditMax} onChange={(v) => setDraft({ ...draft, creditMax: v })} half keyboard />
            </View>
          </View>

          <View style={styles.modalFooter}>
            <Pressable onPress={resetFilters}><Text style={styles.resetLink}>Reset</Text></Pressable>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Pressable onPress={() => setFilterOpen(false)} style={styles.btnCancel}><Text style={styles.btnCancelText}>Cancel</Text></Pressable>
              <Pressable onPress={applyFilters} style={styles.btnApply}><Text style={styles.btnApplyText}>Apply</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* View modal (read-only fallback) */}
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
                const amt = num(le.amount);
                const isDr = amt > 0;
                const isCr = amt < 0;
                const absAmt = Math.abs(amt);
                return (
                  <View key={idx}>
                    <View style={styles.viewModalTableRow}>
                      <Text style={[styles.viewModalTableCol, { flex: 1 }]}>{le.ledger_name || '—'}</Text>
                      <Text style={[styles.viewModalTableCol, { width: 100, textAlign: 'right' }]}>{isDr ? fmtMoney(absAmt) : '—'}</Text>
                      <Text style={[styles.viewModalTableCol, { width: 100, textAlign: 'right' }]}>{isCr ? fmtMoney(absAmt) : '—'}</Text>
                    </View>
                    {le.inventoryEntries && le.inventoryEntries.map((inv, iIdx) => (
                      <View key={iIdx} style={styles.viewModalInvRow}>
                        <Text style={styles.viewModalInvText}>↳ {inv.item_name} × {inv.qty} @ ₹{fmtMoney(inv.rate)}   ₹{fmtMoney(inv.amount)}</Text>
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
        message={deleteTarget ? `Are you sure you want to delete ${deleteTarget.vch_type_name} ${deleteTarget.vch_no || ''}?` : ''}
        confirmLabel="Delete"
        danger
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={onDelete}
      />
    </View>
  );
}

// Small labelled text input used inside the Filters modal.
function Field({ label, placeholder, value, onChange, half, keyboard }: {
  label?: string; placeholder: string; value: string; onChange: (v: string) => void; half?: boolean; keyboard?: boolean;
}) {
  return (
    <View style={half ? { flex: 1 } : undefined}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboard ? 'numeric' : 'default'}
        style={styles.fieldInput}
      />
    </View>
  );
}

// ── Web inline styles (plain objects for raw DOM elements) ────────────────────
const btnGhost: React.CSSProperties = {
  display: 'flex', alignItems: 'center', height: 34, padding: '0 14px',
  border: `1px solid ${colors.border}`, borderRadius: 4, backgroundColor: '#FFF',
  color: colors.textLabel, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
};
const dateGroup: React.CSSProperties = {
  display: 'flex', alignItems: 'center', border: `1px solid ${colors.border}`,
  borderRadius: 4, overflow: 'hidden', backgroundColor: '#FFF',
};
const dateLabel: React.CSSProperties = {
  padding: '0 8px', fontSize: 11, fontWeight: 700, color: colors.textMuted,
  display: 'flex', alignItems: 'center', borderRight: `1px solid ${colors.border}`, height: 32,
};
const dateInput: React.CSSProperties = {
  border: 'none', height: 32, padding: '0 8px', outline: 'none', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer',
};
// Glows when the range has moved off today — click resets and clears the glow.
const btnTodayActive: React.CSSProperties = {
  backgroundColor: LINK, color: '#FFF', borderColor: LINK, boxShadow: '0 0 0 3px rgba(37,99,235,0.25)',
};
// Active-filter count circle on the Filter button.
const filterBadge: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
  backgroundColor: LINK, color: '#FFF', fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
};

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  tableWrap: { flex: 1, minHeight: 200, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.card },

  errorBanner: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  errorText: { fontFamily: typography.uiBold, color: colors.danger, fontSize: 13 },

  nativeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, flexWrap: 'wrap', gap: 8 },
  nativeTitle: { fontSize: 20, fontFamily: typography.uiHeavy, color: colors.textStrong },
  nativeBtn: { height: 34, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  nativeBtnActive: { backgroundColor: LINK, borderColor: LINK },
  nativeBtnText: { fontSize: 13, fontFamily: typography.uiBold, color: colors.textLabel },
  nativeBtnTextActive: { color: '#FFF' },

  // Columns — identical widths across header / rows / totals for alignment.
  // Each non-last column draws a right divider → full vertical grid.
  colDate: { width: 130, justifyContent: 'center', paddingHorizontal: spacing.md, borderRightWidth: 1, borderRightColor: colors.border },
  colParty: { flex: 1, minWidth: 180, justifyContent: 'center', paddingHorizontal: spacing.md, borderRightWidth: 1, borderRightColor: colors.border },
  colVchNo: { width: 150, justifyContent: 'center', paddingHorizontal: spacing.md, borderRightWidth: 1, borderRightColor: colors.border },
  colType: { width: 130, justifyContent: 'center', paddingHorizontal: spacing.md, borderRightWidth: 1, borderRightColor: colors.border },
  colNum: { width: 130, justifyContent: 'center', paddingHorizontal: spacing.md, borderRightWidth: 1, borderRightColor: colors.border },
  colAction: { width: 110, justifyContent: 'center', paddingHorizontal: spacing.md },
  cellRight: { alignItems: 'flex-end' },

  headerRow: { flexDirection: 'row', backgroundColor: HEADER_BG, borderBottomWidth: 1, borderBottomColor: colors.border, height: 38, alignItems: 'stretch' },
  headerCell: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 4 },
  headerCellRight: { justifyContent: 'flex-end' },
  headerText: { fontSize: 13, color: colors.textStrong, fontFamily: typography.uiBold, letterSpacing: 0.3 },
  caret: { fontSize: 11, color: colors.textMuted, fontFamily: typography.ui },
  caretActive: { color: colors.text },

  body: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'stretch', height: 40, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card },
  rowAlt: { backgroundColor: '#FBFCFE' },
  // Light glow that follows the cursor across the hovered row (web only).
  rowHover: { backgroundColor: '#EEF4FF', ...(Platform.OS === 'web' ? ({ boxShadow: 'inset 0 0 0 1px rgba(37,99,235,0.18)' } as any) : null) },
  emptyRow: { padding: spacing.xl, alignItems: 'center' },

  dateText: { fontSize: 14, color: colors.textLabel, fontFamily: typography.uiMedium },
  partyText: { fontSize: 15, color: colors.text, fontFamily: typography.uiBold },
  linkText: { fontSize: 15, color: LINK, fontFamily: typography.uiBold },
  typeText: { fontSize: 14, color: colors.textLabel, fontFamily: typography.uiMedium },
  // Debit & Credit share one neutral style — no green/red split.
  amountText: { fontSize: 15, color: colors.text, fontFamily: typography.uiBold },
  muted: { fontSize: 14, color: colors.textMuted, fontFamily: typography.uiMedium },

  actionCell: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 14 },
  iconBtn: { padding: 4 },

  totalsRow: { flexDirection: 'row', alignItems: 'stretch', height: 40, backgroundColor: HEADER_BG, borderTopWidth: 1, borderTopColor: colors.border },
  totalsLabelCell: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.md, borderRightWidth: 1, borderRightColor: colors.border },
  totalsLabel: { fontSize: 14, fontFamily: typography.uiHeavy, color: colors.text },
  totalsNum: { fontSize: 15, fontFamily: typography.uiHeavy, color: colors.text },

  pageBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, height: 44, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card },
  pageInfo: { fontSize: 13, color: colors.textLabel, fontFamily: typography.uiMedium },
  pageText: { fontSize: 13, color: colors.textStrong, fontFamily: typography.uiBold },
  pageNav: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pageArrow: { width: 28, height: 28, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  pageArrowDisabled: { opacity: 0.4 },
  pageArrowText: { fontSize: 16, color: colors.textLabel, fontFamily: typography.uiBold, lineHeight: 18 },

  // Filters modal
  fieldRow: { flexDirection: 'row', gap: spacing.md },
  fieldLabel: { fontSize: 11, color: colors.textLabel, fontFamily: typography.uiBold, textTransform: 'uppercase', marginBottom: 6, letterSpacing: 0.3 },
  fieldInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 12, height: 40, fontSize: 13, fontFamily: typography.ui, color: colors.textStrong, backgroundColor: colors.card },
  modalFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  resetLink: { fontSize: 13, color: colors.textLabel, fontFamily: typography.uiBold, textDecorationLine: 'underline' },
  btnCancel: { paddingHorizontal: 16, height: 38, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  btnCancelText: { fontSize: 13, fontFamily: typography.uiBold, color: colors.textLabel },
  btnApply: { paddingHorizontal: 18, height: 38, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: LINK },
  btnApplyText: { fontSize: 13, fontFamily: typography.uiBold, color: '#FFF' },

  // View modal
  viewModalContent: { paddingBottom: spacing.lg },
  viewModalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xl },
  viewModalHeaderCol: { flex: 1 },
  viewModalHeaderLabel: { fontSize: 11, color: colors.textMuted, fontFamily: typography.uiBold, textTransform: 'uppercase', marginBottom: 4 },
  viewModalHeaderValue: { fontSize: 14, color: colors.textStrong, fontFamily: typography.uiBold },
  viewModalSectionTitle: { fontSize: 11, color: colors.textMuted, fontFamily: typography.uiBold, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 },
  viewModalTable: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card, overflow: 'hidden' },
  viewModalTableRowHeader: { flexDirection: 'row', padding: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.background },
  viewModalTableColH: { fontSize: 11, color: colors.textMuted, fontFamily: typography.uiBold },
  viewModalTableRow: { flexDirection: 'row', padding: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  viewModalTableCol: { fontSize: 13, color: colors.textStrong, fontFamily: typography.ui },
  viewModalInvRow: { paddingLeft: 24, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: '#F8FAFC' },
  viewModalInvText: { fontSize: 12, color: colors.textMuted, fontFamily: typography.uiMedium },
});
