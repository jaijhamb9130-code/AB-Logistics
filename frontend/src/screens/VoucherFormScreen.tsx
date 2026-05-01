/**
 * VoucherFormScreen — create / edit a Tally-style voucher.
 *
 * Voucher type drives sign convention via VchType.deemed_positive:
 *   YES (Sales/Debit Note)     → Party Dr, Goods Cr, inventory negative
 *   NO  (Purchase/Credit Note) → Party Cr, Goods Dr, inventory positive
 *   null (Receipt/Payment/Journal/Contra) → journal mode (Dr/Cr ledger table)
 *
 * Backend enforces sum-to-zero. Frontend pre-validates: items + ledgers,
 * GST auto-computed by isIgst flag, bill allocation balanced before save.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ButtonPrimary } from '../components/ButtonPrimary';
import { Loader } from '../components/Loader';
import { Modal } from '../components/Modal';
import { colors, radius, spacing, text, typography } from '../constants/theme';
import { voucherService } from '../services/voucherService';
import { vchTypeService } from '../services/vchTypeService';
import { partyLedgerService } from '../services/partyLedgerService';
import { itemMasterService } from '../services/itemMasterService';
import type {
  CreateVoucherRequest,
  VchType,
  OtherLedger,
  PendingRef,
  VoucherDetail,
} from '../../../shared/types/voucher';
import type { ItemMasterItem } from '../../../shared/types/itemMaster';
import type { PartyLedgerSearchResult } from '../../../shared/types/partyLedger';
import type { BillingStackParamList } from '../navigation/types';

const HOME_STATE = 'Assam';

type Nav = NativeStackNavigationProp<BillingStackParamList, 'VoucherForm'>;
type Route = RouteProp<BillingStackParamList, 'VoucherForm'>;

// ─── Local row state types ──────────────────────────────────────────────────

interface LineItem {
  id: string;
  item_id: number | null;
  item_name: string;
  qty: number;
  rate: number;
  amount: number;
  gst_rate: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  batch_rows?: { batch_name: string | null; qty: number; rate: number; amount: number }[];
}

interface BatchDraftRow {
  id: string;
  batch_name: string;
  qty: number;
  rate: number;
  amount: number;
}

interface LedgerRow {
  id: string;
  ledger_id: number | null;
  ledger_name: string;
  amount: number;
  auto: boolean;
  search: string;
}

interface BillRefRow {
  id: string;
  type: 'New' | 'Agr.' | 'On Account';
  refno: string;
  amount: number;
  direction: 'Dr' | 'Cr';
}

interface JournalRow {
  id: string;
  drOrCr: 'Dr' | 'Cr';
  ledger_id: number | null;
  ledger_name: string;
  amount: number;
  search: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2);

function emptyLine(): LineItem {
  return {
    id: uid(), item_id: null, item_name: '', qty: 1, rate: 0,
    amount: 0, gst_rate: 0, cgst_amount: 0, sgst_amount: 0, igst_amount: 0,
  };
}

function emptyJournalRow(): JournalRow {
  return { id: uid(), drOrCr: 'Dr', ledger_id: null, ledger_name: '', amount: 0, search: '' };
}

function applyGst(line: LineItem, isIgst: boolean): LineItem {
  const amount = +(line.qty * line.rate).toFixed(2);
  let cgst = 0, sgst = 0, igst = 0;
  if (isIgst) {
    igst = +(amount * line.gst_rate / 100).toFixed(2);
  } else {
    cgst = +(amount * (line.gst_rate / 2) / 100).toFixed(2);
    sgst = +(amount * (line.gst_rate / 2) / 100).toFixed(2);
  }
  return { ...line, amount, cgst_amount: cgst, sgst_amount: sgst, igst_amount: igst };
}

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

// ─── Component ──────────────────────────────────────────────────────────────

export function VoucherFormScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const editId = route.params?.id ?? null;
  const isEdit = editId !== null;

  // ── Master data
  const [vchTypes, setVchTypes] = useState<VchType[]>([]);
  const [items, setItems] = useState<ItemMasterItem[]>([]);
  const [otherLedgers, setOtherLedgers] = useState<OtherLedger[]>([]);
  const [taxIds, setTaxIds] = useState<{ cgst: number | null; sgst: number | null; igst: number | null }>({ cgst: null, sgst: null, igst: null });

  // ── Selection
  const [vchTypeId, setVchTypeId] = useState<number | null>(null);
  const [vchNo, setVchNo] = useState('');
  const [vchDate, setVchDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [remark, setRemark] = useState('');

  // ── Party
  const [partyId, setPartyId] = useState<number | null>(null);
  const [partyName, setPartyName] = useState('');
  const [partyState, setPartyState] = useState('');
  const [partySearch, setPartySearch] = useState('');
  const [partySuggestions, setPartySuggestions] = useState<PartyLedgerSearchResult[]>([]);
  const [partyDropOpen, setPartyDropOpen] = useState(false);
  const [isIgst, setIsIgst] = useState(false);
  const [billByBill, setBillByBill] = useState(false);

  // ── Inventory mode rows
  const [lines, setLines] = useState<LineItem[]>([emptyLine()]);
  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([]);

  // ── Journal mode rows
  const [journalRows, setJournalRows] = useState<JournalRow[]>([emptyJournalRow(), emptyJournalRow()]);

  // ── Bill allocation
  const [billRefs, setBillRefs] = useState<BillRefRow[]>([]);
  const [billOpen, setBillOpen] = useState(false);
  const [pendingRefs, setPendingRefs] = useState<PendingRef[]>([]);

  // ── Party search mode (Sundry-Debtor only vs ALL ledgers)
  const [allLedgersMode, setAllLedgersMode] = useState(false);

  // ── Batch picker modal
  const [batchLineIdx, setBatchLineIdx] = useState<number | null>(null);
  const [batchDraft, setBatchDraft] = useState<BatchDraftRow[]>([]);

  // ── State flags
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Derived
  const currentVchType = vchTypes.find((t) => t.id === vchTypeId) || null;
  const isJournalType = (() => {
    const n = (currentVchType?.name || '').toLowerCase();
    return n === 'receipt' || n === 'payment' || n === 'journal' || n === 'contra';
  })();
  const isPurchaseMode = (() => {
    const n = (currentVchType?.name || '').toLowerCase();
    return n.includes('purchase') || n.includes('debit');
  })();

  // ── Load master data on mount
  useEffect(() => {
    Promise.allSettled([
      vchTypeService.list().then((vts) => {
        setVchTypes(vts);
        if (!isEdit && vchTypeId === null) {
          const sales = vts.find((t) => t.name === 'Sales' && t.is_system) || vts[0];
          if (sales) setVchTypeId(sales.id);
        }
      }),
      itemMasterService.list().then(setItems),
      voucherService.otherLedgers().then((ol) => {
        setOtherLedgers(ol);
        const find = (n: string) => ol.find((l) => l.name.toUpperCase() === n)?.id ?? null;
        setTaxIds({ cgst: find('CGST'), sgst: find('SGST'), igst: find('IGST') });
      }),
    ]);
  }, [isEdit]);

  // ── Auto-suggest next vch_no when type changes (create mode only)
  useEffect(() => {
    if (isEdit || vchTypeId === null) return;
    voucherService.nextNo(vchTypeId).then(setVchNo).catch(() => { /* ignore */ });
  }, [vchTypeId, isEdit]);

  // ── Hydrate edit mode
  useEffect(() => {
    if (!isEdit || editId === null) return;
    let cancelled = false;
    setLoading(true);
    voucherService.get(editId).then((v: VoucherDetail) => {
      if (cancelled) return;
      setVchTypeId(v.vch_type_id);
      setVchNo(v.vch_no || '');
      setVchDate((v.vch_date || '').slice(0, 10));
      setRemark(v.remark || '');
      setPartyId(v.party_ledger_id);
      setPartyName(v.party_name || '');

      const dp = v.deemed_positive;
      const isJournal = dp === null && (v.ledgerEntries.length > 0);
      const inventoryEntry = v.ledgerEntries.find((le) => (le.inventoryEntries || []).length > 0);

      if (isJournal && !inventoryEntry) {
        setJournalRows(
          v.ledgerEntries.map((le) => ({
            id: uid(),
            drOrCr: Number(le.amount) >= 0 ? 'Dr' : 'Cr',
            ledger_id: le.ledger_id,
            ledger_name: le.ledger_name || '',
            amount: Math.abs(Number(le.amount)),
            search: le.ledger_name || '',
          }))
        );
      } else if (inventoryEntry) {
        const igstFlag = (inventoryEntry.inventoryEntries || []).some((ie) => Number(ie.gst_rate) > 0 && false); // recomputed below
        // Restore item lines
        setLines(
          (inventoryEntry.inventoryEntries || []).map((ie) => {
            const base: LineItem = {
              id: uid(),
              item_id: ie.item_id,
              item_name: ie.item_name || '',
              qty: Math.abs(Number(ie.qty)),
              rate: Number(ie.rate),
              amount: Math.abs(Number(ie.amount)),
              gst_rate: Number(ie.gst_rate) || 0,
              cgst_amount: 0, sgst_amount: 0, igst_amount: 0,
            };
            return applyGst(base, igstFlag);
          })
        );
        // Restore manual ledgers (excluding party + goods + auto tax/roundoff)
        const goodsLedId = inventoryEntry.id;
        const taxNames = /^(cgst|sgst|igst|roundoff)$/i;
        const manual = v.ledgerEntries.filter(
          (le) => le.id !== goodsLedId
            && le.ledger_id !== v.party_ledger_id
            && !taxNames.test(String(le.ledger_name || ''))
        );
        setLedgerRows(
          manual.map((le) => ({
            id: uid(),
            ledger_id: le.ledger_id,
            ledger_name: le.ledger_name || '',
            amount: Math.abs(Number(le.amount)),
            auto: false,
            search: le.ledger_name || '',
          }))
        );
      }

      // Bill allocations
      if (v.billAllocations.length > 0) {
        setBillRefs(
          v.billAllocations.map((ba) => ({
            id: uid(),
            type: 'Agr.',
            refno: ba.billname || '',
            amount: Math.abs(Number(ba.amount)),
            direction: Number(ba.amount) >= 0 ? 'Dr' : 'Cr',
          }))
        );
      }
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setError('Could not load voucher.');
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [isEdit, editId]);

  // ── Party autocomplete (debounced 250ms). When allLedgersMode is on, search
  //   spans every ledger; otherwise only Sundry-Debtor (ledger_group_id = 1).
  useEffect(() => {
    if (partySearch.length < 2) { setPartySuggestions([]); return; }
    const t = setTimeout(() => {
      const promise = allLedgersMode
        ? voucherService.ledgerSearch(partySearch).then((rows) =>
            rows.map((r) => ({
              id: r.id,
              ledger_group_id: r.ledger_group_id,
              name: r.name,
              city: null,
              gst_no: null,
              // Stash extras for the dropdown to render.
              ledger_group_name: r.ledger_group_name,
              billbybill: r.billbybill,
            }))
          )
        : partyLedgerService.search(1, partySearch);
      promise.then((rows) => setPartySuggestions(rows as PartyLedgerSearchResult[]))
             .catch(() => setPartySuggestions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [partySearch, allLedgersMode]);

  // Clear suggestions when toggling modes — old result set is irrelevant.
  useEffect(() => { setPartySuggestions([]); }, [allLedgersMode]);

  const selectParty = async (p: PartyLedgerSearchResult) => {
    setPartyId(p.id);
    setPartyName(p.name);
    setPartySearch('');
    setPartyDropOpen(false);
    setBillRefs([]);
    // Fetch full row for state-based GST auto-detection + billbybill flag.
    try {
      const full = await partyLedgerService.get(p.id);
      const st = full.state || '';
      setPartyState(st);
      setIsIgst(st ? st.toLowerCase() !== HOME_STATE.toLowerCase() : false);
      // Bill-by-bill is only meaningful for ledgers explicitly flagged as such.
      // Sundry-Debtors default to Yes via the schema migration; other ledgers default No.
      const bbb = (full as any).billbybill;
      setBillByBill(bbb === 'Yes' || (bbb == null && p.ledger_group_id === 1));
    } catch {
      setPartyState('');
      setIsIgst(false);
    }
  };

  // ── Recompute GST on isIgst flip
  useEffect(() => {
    setLines((prev) => prev.map((l) => applyGst(l, isIgst)));
  }, [isIgst]);

  // ── Totals (inventory mode)
  const subtotal = useMemo(() => +lines.reduce((s, l) => s + l.amount, 0).toFixed(2), [lines]);
  const totalCgst = useMemo(() => +lines.reduce((s, l) => s + l.cgst_amount, 0).toFixed(2), [lines]);
  const totalSgst = useMemo(() => +lines.reduce((s, l) => s + l.sgst_amount, 0).toFixed(2), [lines]);
  const totalIgst = useMemo(() => +lines.reduce((s, l) => s + l.igst_amount, 0).toFixed(2), [lines]);

  // Sync auto tax rows whenever GST changes
  useEffect(() => {
    setLedgerRows((prev) => {
      const user = prev.filter((r) => !r.auto);
      const auto: LedgerRow[] = [];
      if (!isIgst) {
        if (totalCgst > 0) auto.push({ id: 'auto-cgst', ledger_id: taxIds.cgst, ledger_name: 'CGST', amount: totalCgst, auto: true, search: 'CGST' });
        if (totalSgst > 0) auto.push({ id: 'auto-sgst', ledger_id: taxIds.sgst, ledger_name: 'SGST', amount: totalSgst, auto: true, search: 'SGST' });
      } else {
        if (totalIgst > 0) auto.push({ id: 'auto-igst', ledger_id: taxIds.igst, ledger_name: 'IGST', amount: totalIgst, auto: true, search: 'IGST' });
      }
      return [...auto, ...user];
    });
  }, [totalCgst, totalSgst, totalIgst, isIgst, taxIds.cgst, taxIds.sgst, taxIds.igst]);

  const ledgerSum = useMemo(() => +ledgerRows.reduce((s, r) => s + (r.amount || 0), 0).toFixed(2), [ledgerRows]);
  const grandTotal = useMemo(() => +(subtotal + ledgerSum).toFixed(2), [subtotal, ledgerSum]);

  // ── Journal totals
  const journalDr = useMemo(
    () => +journalRows.filter((r) => r.drOrCr === 'Dr').reduce((s, r) => s + r.amount, 0).toFixed(2),
    [journalRows]
  );
  const journalCr = useMemo(
    () => +journalRows.filter((r) => r.drOrCr === 'Cr').reduce((s, r) => s + r.amount, 0).toFixed(2),
    [journalRows]
  );
  const journalBalanced = Math.abs(journalDr - journalCr) < 0.01;
  const effectiveTotal = isJournalType ? journalDr : grandTotal;

  // ── Bill allocation totals
  const billAllocSigned = +billRefs.reduce(
    (s, r) => s + (r.direction === 'Cr' ? -r.amount : r.amount), 0
  ).toFixed(2);
  const partyDirection: 'Dr' | 'Cr' = isJournalType
    ? (journalRows.find((r) => r.ledger_id === partyId)?.drOrCr || 'Cr')
    : (isPurchaseMode ? 'Cr' : 'Dr');
  const signedTotal = partyDirection === 'Dr' ? effectiveTotal : -effectiveTotal;
  const billBalance = +(signedTotal - billAllocSigned).toFixed(2);
  const billBalanced = !billByBill || Math.abs(billBalance) < 0.01;

  const updateLine = (idx: number, patch: Partial<LineItem>) => {
    setLines((prev) => {
      const next = [...prev];
      let line = { ...next[idx], ...patch };
      if (patch.item_id !== undefined) {
        const itm = items.find((i) => i.id === patch.item_id);
        if (itm) {
          line.item_name = itm.name;
          line.gst_rate = Number(itm.gst_rate) || 0;
        }
      }
      line = applyGst(line, isIgst);
      next[idx] = line;
      return next;
    });
  };

  const addLine = () => setLines((p) => [...p, emptyLine()]);
  const removeLine = (idx: number) => setLines((p) => (p.length > 1 ? p.filter((_, i) => i !== idx) : p));

  const openBatch = (idx: number) => {
    const existing = lines[idx]?.batch_rows;
    if (existing && existing.length > 0) {
      setBatchDraft(existing.map((b) => ({
        id: uid(),
        batch_name: b.batch_name || '',
        qty: Number(b.qty) || 0,
        rate: Number(b.rate) || 0,
        amount: Number(b.amount) || 0,
      })));
    } else {
      setBatchDraft([{ id: uid(), batch_name: '', qty: 1, rate: lines[idx]?.rate || 0, amount: lines[idx]?.rate || 0 }]);
    }
    setBatchLineIdx(idx);
  };

  const saveBatch = () => {
    if (batchLineIdx === null) return;
    const valid = batchDraft.filter((b) => b.qty > 0);
    const totalQty = +valid.reduce((s, b) => s + b.qty, 0).toFixed(3);
    const totalAmt = +valid.reduce((s, b) => s + b.amount, 0).toFixed(2);
    const avgRate = totalQty > 0 ? +(totalAmt / totalQty).toFixed(4) : 0;
    setLines((prev) => {
      const next = [...prev];
      const base = { ...next[batchLineIdx], qty: totalQty, rate: avgRate };
      const line = applyGst(base, isIgst);
      next[batchLineIdx] = {
        ...line,
        batch_rows: valid.map((b) => ({ batch_name: b.batch_name || null, qty: b.qty, rate: b.rate, amount: b.amount })),
      };
      return next;
    });
    setBatchLineIdx(null);
    setBatchDraft([]);
  };

  const addLedgerRow = () => setLedgerRows((p) => [...p, { id: uid(), ledger_id: null, ledger_name: '', amount: 0, auto: false, search: '' }]);
  const removeLedgerRow = (id: string) => setLedgerRows((p) => p.filter((r) => r.id !== id));

  const openBillAlloc = useCallback(async () => {
    if (billRefs.length === 0) {
      setBillRefs([{ id: uid(), type: 'New', refno: vchNo || '', amount: effectiveTotal, direction: partyDirection }]);
    }
    setBillOpen(true);
    if (partyId) {
      try {
        const refs = await voucherService.pendingRefs(partyId);
        setPendingRefs(refs);
      } catch { setPendingRefs([]); }
    }
  }, [billRefs.length, vchNo, effectiveTotal, partyDirection, partyId]);

  // ─── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setError(null);
    if (!partyId) { setError('Pick a party first.'); return; }
    if (vchTypeId === null) { setError('Pick a voucher type.'); return; }

    let payload: CreateVoucherRequest;
    if (isJournalType) {
      const valid = journalRows.filter((r) => r.ledger_id && r.amount > 0);
      if (valid.length < 2) { setError('Add at least 2 ledger rows for a journal voucher.'); return; }
      if (!journalBalanced) { setError(`Dr (${fmt(journalDr)}) must equal Cr (${fmt(journalCr)}).`); return; }
      if (billByBill && !billBalanced) { setError('Bill allocation must balance to grand total.'); return; }
      payload = {
        vch_type_id: vchTypeId,
        vch_no: vchNo || null,
        vch_date: vchDate || null,
        party_ledger_id: partyId,
        remark: remark.trim() || null,
        items: [],
        ledgers: valid.map((r) => ({
          ledger_id: r.ledger_id!,
          amount: r.drOrCr === 'Dr' ? r.amount : -r.amount,
        })),
        bill_allocation: billByBill ? billRefs.map((r) => ({ type: r.type, refno: r.refno, amount: r.amount, direction: r.direction })) : undefined,
      };
    } else {
      const validLines = lines.filter((l) => l.item_id);
      if (validLines.length === 0) { setError('Add at least one item.'); return; }
      if (billByBill && !billBalanced) { setError('Bill allocation must balance to grand total.'); return; }
      const validLedgers = ledgerRows.filter((r) => r.ledger_id && r.amount > 0).map((r) => ({ ledger_id: r.ledger_id!, amount: r.amount }));
      payload = {
        vch_type_id: vchTypeId,
        vch_no: vchNo || null,
        vch_date: vchDate || null,
        party_ledger_id: partyId,
        remark: remark.trim() || null,
        is_igst: isIgst,
        items: validLines.map((l) => ({
          item_id: l.item_id!,
          qty: l.qty, rate: l.rate, amount: l.amount,
          gst_rate: l.gst_rate,
          cgst_amount: l.cgst_amount, sgst_amount: l.sgst_amount, igst_amount: l.igst_amount,
          batch_rows: l.batch_rows && l.batch_rows.length > 0 ? l.batch_rows : null,
        })),
        ledgers: validLedgers,
        bill_allocation: billByBill ? billRefs.map((r) => ({ type: r.type, refno: r.refno, amount: r.amount, direction: r.direction })) : undefined,
      };
    }

    setSubmitting(true);
    try {
      if (isEdit && editId !== null) {
        await voucherService.update(editId, payload);
      } else {
        await voucherService.create(payload);
      }
      navigation.goBack();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loader />;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      <Text style={text.heading}>{isEdit ? 'Edit Voucher' : 'New Voucher'}</Text>

      {/* HEADER ROW: type | vch_no | date */}
      <View style={styles.headerRow}>
        <View style={[styles.field, { flex: 2, minWidth: 200 }]}>
          <Text style={styles.fieldLabel}>Voucher Type</Text>
          <View style={styles.typeChipsRow}>
            {vchTypes.filter((t) => t.is_system).map((t) => {
              const active = vchTypeId === t.id;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setVchTypeId(t.id)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={[styles.field, { flex: 1, minWidth: 130 }]}>
          <Text style={styles.fieldLabel}>Voucher No</Text>
          <TextInput value={vchNo} onChangeText={setVchNo} style={styles.input} placeholder="S-001" placeholderTextColor={colors.textMuted} />
        </View>
        <View style={[styles.field, { flex: 1, minWidth: 130 }]}>
          <Text style={styles.fieldLabel}>Date</Text>
          <TextInput value={vchDate} onChangeText={setVchDate} style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} />
        </View>
      </View>

      {/* PARTY ROW */}
      <View style={styles.partyRow}>
        <View style={styles.partyLabelRow}>
          <Text style={styles.fieldLabel}>
            Party {partyState ? <Text style={styles.partyState}>· {partyState} · {isIgst ? 'IGST' : 'CGST+SGST'}</Text> : null}
          </Text>
          <Pressable
            onPress={() => { setAllLedgersMode((m) => !m); setPartyId(null); setPartyName(''); setPartySearch(''); }}
            style={[styles.toggle, allLedgersMode && styles.toggleActive]}
          >
            <Text style={[styles.toggleText, allLedgersMode && styles.toggleTextActive]}>
              {allLedgersMode ? '✓ All ledgers' : 'Sundry Debtors only'}
            </Text>
          </Pressable>
        </View>
        <View style={styles.partyInputWrap}>
          <TextInput
            value={partyId ? partyName : partySearch}
            onChangeText={(v) => {
              if (partyId) {
                setPartyId(null); setPartyName(''); setBillByBill(false); setPartyState(''); setIsIgst(false);
              }
              setPartySearch(v); setPartyDropOpen(true);
            }}
            onFocus={() => setPartyDropOpen(true)}
            onBlur={() => setTimeout(() => setPartyDropOpen(false), 200)}
            placeholder="Type to search…"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, partyId !== null && styles.inputBound]}
          />
          {partyDropOpen && partySuggestions.length > 0 ? (
            <View style={styles.dropdown}>
              {partySuggestions.slice(0, 12).map((p) => {
                const groupName = (p as any).ledger_group_name as string | undefined;
                const subtitle = allLedgersMode ? groupName : p.city;
                return (
                  <Pressable key={p.id} onPress={() => selectParty(p)} style={styles.dropdownRow}>
                    <Text style={text.value}>{p.name}</Text>
                    {subtitle ? <Text style={text.meta}>{subtitle}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      </View>

      {/* JOURNAL MODE */}
      {isJournalType ? (
        <View style={styles.section}>
          <Text style={text.subheading}>Ledger Entries</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { width: 40 }]}>#</Text>
            <Text style={[styles.th, { width: 70 }]}>Type</Text>
            <Text style={[styles.th, { flex: 1 }]}>Ledger</Text>
            <Text style={[styles.th, { width: 130, textAlign: 'right' }]}>Amount (₹)</Text>
            <Text style={[styles.th, { width: 36 }]}> </Text>
          </View>
          {journalRows.map((row, idx) => (
            <JournalRowEditor
              key={row.id}
              row={row}
              idx={idx}
              ledgers={otherLedgers}
              onChange={(patch) => setJournalRows((p) => p.map((r) => r.id === row.id ? { ...r, ...patch } : r))}
              onRemove={() => setJournalRows((p) => p.length > 2 ? p.filter((r) => r.id !== row.id) : p)}
            />
          ))}
          <Pressable onPress={() => setJournalRows((p) => [...p, emptyJournalRow()])} style={styles.addRowBtn}>
            <Text style={[text.action, { color: colors.brandRed }]}>+ Add Row</Text>
          </Pressable>
          <View style={styles.totalsRow}>
            <Text style={text.subheading}>Totals</Text>
            <View style={styles.totalsRight}>
              <Text style={[text.numeric, { color: journalBalanced ? colors.success : colors.danger }]}>
                Dr ₹{fmt(journalDr)}  ·  Cr ₹{fmt(journalCr)}
                {!journalBalanced ? `  ·  Diff ₹${fmt(Math.abs(journalDr - journalCr))}` : '  ✓'}
              </Text>
            </View>
          </View>
        </View>
      ) : (
        // INVENTORY MODE
        <View style={styles.section}>
          <Text style={text.subheading}>Items</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { width: 40 }]}>#</Text>
            <Text style={[styles.th, { flex: 2, minWidth: 180 }]}>Item</Text>
            <Text style={[styles.th, { width: 70, textAlign: 'right' }]}>Qty</Text>
            <Text style={[styles.th, { width: 100, textAlign: 'right' }]}>Rate</Text>
            <Text style={[styles.th, { width: 110, textAlign: 'right' }]}>Amount</Text>
            <Text style={[styles.th, { width: 60, textAlign: 'right' }]}>GST%</Text>
            <Text style={[styles.th, { width: 36 }]}> </Text>
          </View>
          {lines.map((line, idx) => (
            <ItemRowEditor
              key={line.id}
              line={line}
              idx={idx}
              items={items}
              onChange={(patch) => updateLine(idx, patch)}
              onRemove={() => removeLine(idx)}
              canRemove={lines.length > 1}
              onOpenBatch={() => openBatch(idx)}
            />
          ))}
          <Pressable onPress={addLine} style={styles.addRowBtn}>
            <Text style={[text.action, { color: colors.brandRed }]}>+ Add Item</Text>
          </Pressable>

          {/* Subtotal + ledger rows */}
          <View style={styles.subtotalRow}>
            <Text style={[text.label]}>Item Subtotal</Text>
            <Text style={[text.numeric, { color: colors.textStrong }]}>₹{fmt(subtotal)}</Text>
          </View>

          {ledgerRows.map((row) => (
            <View key={row.id} style={styles.ledgerRow}>
              <Text style={[text.value, { width: 40, color: colors.textMuted }]}>·</Text>
              <View style={{ flex: 1, minWidth: 180 }}>
                {row.auto ? (
                  <Text style={text.value}>{row.ledger_name} (auto)</Text>
                ) : (
                  <LedgerPickerInline row={row} ledgers={otherLedgers} onChange={(patch) => setLedgerRows((p) => p.map((r) => r.id === row.id ? { ...r, ...patch } : r))} />
                )}
              </View>
              <TextInput
                value={row.amount ? String(row.amount) : ''}
                onChangeText={(v) => setLedgerRows((p) => p.map((r) => r.id === row.id ? { ...r, amount: Number(v) || 0 } : r))}
                editable={!row.auto}
                keyboardType="decimal-pad"
                style={[styles.input, styles.amountInput, row.auto && styles.inputDisabled]}
              />
              <Pressable onPress={() => removeLedgerRow(row.id)} disabled={row.auto} style={[styles.removeBtn, row.auto && { opacity: 0.3 }]}>
                <Text style={styles.removeBtnText}>×</Text>
              </Pressable>
            </View>
          ))}
          <Pressable onPress={addLedgerRow} style={styles.addRowBtn}>
            <Text style={[text.action, { color: colors.brandRed }]}>+ Add Ledger</Text>
          </Pressable>

          {/* Grand total */}
          <View style={styles.grandTotalRow}>
            <Text style={text.subheading}>Grand Total</Text>
            {billByBill ? (
              <Pressable onPress={openBillAlloc}>
                <Text style={[text.numeric, { fontSize: 18, color: billBalanced ? colors.success : colors.warning, textDecorationLine: 'underline' }]}>
                  ₹{fmt(grandTotal)} {billBalanced ? '✓' : '· allocate'}
                </Text>
              </Pressable>
            ) : (
              <Text style={[text.numeric, { fontSize: 18, color: colors.brandRed }]}>₹{fmt(grandTotal)}</Text>
            )}
          </View>
        </View>
      )}

      {/* JOURNAL: bill alloc trigger */}
      {isJournalType && billByBill ? (
        <View style={styles.section}>
          <Pressable onPress={openBillAlloc} style={styles.allocateBtn}>
            <Text style={[text.action, { color: billBalanced ? colors.success : colors.warning }]}>
              Bill Allocation {billBalanced ? '✓' : `· ₹${fmt(Math.abs(billBalance))} unallocated`}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* REMARK */}
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Remark</Text>
        <TextInput
          value={remark}
          onChangeText={setRemark}
          placeholder="Optional note"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
        />
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable onPress={() => navigation.goBack()} style={styles.cancelBtn}>
          <Text style={[text.action, { color: colors.text }]}>Cancel</Text>
        </Pressable>
        <ButtonPrimary title={isEdit ? 'Update Voucher' : 'Save Voucher'} onPress={handleSubmit} loading={submitting} />
      </View>

      {/* BILL ALLOCATION MODAL */}
      <Modal visible={billOpen} onClose={() => setBillOpen(false)} title={`Bill Allocation — ${partyName}`} maxWidth={620}>
        <View style={{ padding: spacing.md }}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { width: 30 }]}>#</Text>
            <Text style={[styles.th, { width: 100 }]}>Type</Text>
            <Text style={[styles.th, { flex: 1 }]}>Ref / Bill No.</Text>
            <Text style={[styles.th, { width: 110, textAlign: 'right' }]}>Amount</Text>
            <Text style={[styles.th, { width: 60, textAlign: 'center' }]}>Dr/Cr</Text>
            <Text style={[styles.th, { width: 30 }]}> </Text>
          </View>
          {billRefs.map((row, idx) => (
            <BillRefRowEditor
              key={row.id}
              row={row}
              idx={idx}
              pending={pendingRefs}
              onChange={(patch) => setBillRefs((p) => p.map((r) => r.id === row.id ? { ...r, ...patch } : r))}
              onRemove={() => setBillRefs((p) => p.length > 1 ? p.filter((r) => r.id !== row.id) : p)}
            />
          ))}
          <Pressable
            onPress={() => {
              const used = billRefs.reduce((s, r) => s + (r.direction === 'Cr' ? -r.amount : r.amount), 0);
              const remaining = +(signedTotal - used).toFixed(2);
              const dir: 'Dr' | 'Cr' = remaining >= 0 ? 'Dr' : 'Cr';
              setBillRefs((p) => [...p, { id: uid(), type: 'New', refno: '', amount: Math.abs(remaining), direction: dir }]);
            }}
            style={styles.addRowBtn}
          >
            <Text style={[text.action, { color: colors.brandRed }]}>+ Add Reference</Text>
          </Pressable>
          <View style={styles.totalsRow}>
            <Text style={text.label}>Total ₹{fmt(effectiveTotal)} ({partyDirection})</Text>
            <Text style={[text.numeric, { color: billBalanced ? colors.success : colors.warning }]}>
              Allocated ₹{fmt(Math.abs(billAllocSigned))}  ·  Balance ₹{fmt(Math.abs(billBalance))} {billBalanced ? '✓' : ''}
            </Text>
          </View>
          <View style={{ marginTop: spacing.md }}>
            <ButtonPrimary title="Done" onPress={() => setBillOpen(false)} disabled={!billBalanced} />
          </View>
        </View>
      </Modal>

      {/* BATCH PICKER MODAL */}
      <Modal
        visible={batchLineIdx !== null}
        onClose={() => { setBatchLineIdx(null); setBatchDraft([]); }}
        title={`Batches — ${batchLineIdx !== null ? lines[batchLineIdx]?.item_name || 'Item' : ''}`}
        maxWidth={620}
      >
        <View style={{ padding: spacing.md }}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { width: 30 }]}>#</Text>
            <Text style={[styles.th, { flex: 1 }]}>Batch No.</Text>
            <Text style={[styles.th, { width: 70, textAlign: 'right' }]}>Qty</Text>
            <Text style={[styles.th, { width: 100, textAlign: 'right' }]}>Rate</Text>
            <Text style={[styles.th, { width: 110, textAlign: 'right' }]}>Amount</Text>
            <Text style={[styles.th, { width: 30 }]}> </Text>
          </View>
          {batchDraft.map((row, i) => (
            <View key={row.id} style={styles.tableRow}>
              <Text style={[styles.cellMeta, { width: 30 }]}>{i + 1}</Text>
              <TextInput
                value={row.batch_name}
                onChangeText={(v) => setBatchDraft((d) => d.map((r) => r.id === row.id ? { ...r, batch_name: v } : r))}
                placeholder="Batch / Lot No."
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { flex: 1 }]}
              />
              <TextInput
                value={row.qty ? String(row.qty) : ''}
                onChangeText={(v) => {
                  const qty = Number(v) || 0;
                  setBatchDraft((d) => d.map((r) => r.id === row.id ? { ...r, qty, amount: +(qty * r.rate).toFixed(2) } : r));
                }}
                keyboardType="decimal-pad"
                style={[styles.input, { width: 70, textAlign: 'right' }]}
              />
              <TextInput
                value={row.rate ? String(row.rate) : ''}
                onChangeText={(v) => {
                  const rate = Number(v) || 0;
                  setBatchDraft((d) => d.map((r) => r.id === row.id ? { ...r, rate, amount: +(r.qty * rate).toFixed(2) } : r));
                }}
                keyboardType="decimal-pad"
                style={[styles.input, { width: 100, textAlign: 'right' }]}
              />
              <TextInput
                value={row.amount ? String(row.amount) : ''}
                onChangeText={(v) => {
                  const amount = Number(v) || 0;
                  setBatchDraft((d) => d.map((r) => r.id === row.id ? {
                    ...r, amount, rate: r.qty > 0 ? +(amount / r.qty).toFixed(4) : r.rate,
                  } : r));
                }}
                keyboardType="decimal-pad"
                style={[styles.input, { width: 110, textAlign: 'right' }]}
              />
              <Pressable
                onPress={() => setBatchDraft((d) => d.length > 1 ? d.filter((r) => r.id !== row.id) : d)}
                style={styles.removeBtn}
              >
                <Text style={styles.removeBtnText}>×</Text>
              </Pressable>
            </View>
          ))}
          <Pressable
            onPress={() => setBatchDraft((d) => [...d, { id: uid(), batch_name: '', qty: 1, rate: 0, amount: 0 }])}
            style={styles.addRowBtn}
          >
            <Text style={[text.action, { color: colors.brandRed }]}>+ Add Batch</Text>
          </Pressable>
          <View style={styles.totalsRow}>
            <Text style={text.label}>
              Total Qty {batchDraft.reduce((s, b) => s + b.qty, 0).toFixed(3)}
            </Text>
            <Text style={[text.numeric, { color: colors.textStrong }]}>
              ₹{fmt(batchDraft.reduce((s, b) => s + b.amount, 0))}
            </Text>
          </View>
          <View style={{ marginTop: spacing.md, flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.md }}>
            <Pressable onPress={() => { setBatchLineIdx(null); setBatchDraft([]); }} style={styles.cancelBtn}>
              <Text style={[text.action, { color: colors.text }]}>Cancel</Text>
            </Pressable>
            <ButtonPrimary title="Save Batches" onPress={saveBatch} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ItemRowEditor({ line, idx, items, onChange, onRemove, canRemove, onOpenBatch }: {
  line: LineItem;
  idx: number;
  items: ItemMasterItem[];
  onChange: (patch: Partial<LineItem>) => void;
  onRemove: () => void;
  canRemove: boolean;
  onOpenBatch: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(line.item_name);
  useEffect(() => { setSearch(line.item_name); }, [line.item_name]);
  const filtered = items.filter((i) => !search || i.name.toLowerCase().includes(search.toLowerCase())).slice(0, 12);
  const selectedItem = items.find((i) => i.id === line.item_id) as (ItemMasterItem & { batch?: 'Yes' | 'No' }) | undefined;
  const isBatch = selectedItem?.batch === 'Yes';
  const batchCount = line.batch_rows?.length ?? 0;

  return (
    <View style={styles.tableRow}>
      <Text style={[styles.cellMeta, { width: 40 }]}>{idx + 1}</Text>
      <View style={{ flex: 2, minWidth: 180 }}>
        <TextInput
          value={search}
          onChangeText={(v) => { setSearch(v); setOpen(true); if (!v) onChange({ item_id: null, item_name: '' }); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="Pick item…"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, line.item_id !== null && styles.inputBound]}
        />
        {open && filtered.length > 0 ? (
          <View style={styles.dropdown}>
            {filtered.map((i) => (
              <Pressable
                key={i.id}
                onPress={() => { onChange({ item_id: i.id, item_name: i.name }); setSearch(i.name); setOpen(false); }}
                style={styles.dropdownRow}
              >
                <Text style={text.value}>{i.name}</Text>
                {i.gst_rate ? <Text style={text.meta}>GST {i.gst_rate}%</Text> : null}
              </Pressable>
            ))}
          </View>
        ) : null}
        {isBatch ? (
          <Pressable onPress={onOpenBatch} style={styles.batchBtn}>
            <Text style={styles.batchBtnText}>
              {batchCount > 0 ? `Batches: ${batchCount} ✎` : 'Add batches…'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <TextInput
        value={line.qty ? String(line.qty) : ''}
        onChangeText={(v) => onChange({ qty: Number(v) || 0 })}
        keyboardType="decimal-pad"
        style={[styles.input, { width: 70, textAlign: 'right' }]}
      />
      <TextInput
        value={line.rate ? String(line.rate) : ''}
        onChangeText={(v) => onChange({ rate: Number(v) || 0 })}
        keyboardType="decimal-pad"
        style={[styles.input, { width: 100, textAlign: 'right' }]}
      />
      <TextInput
        value={line.amount ? String(line.amount) : ''}
        editable={false}
        style={[styles.input, styles.inputDisabled, { width: 110, textAlign: 'right' }]}
      />
      <TextInput
        value={line.gst_rate ? String(line.gst_rate) : ''}
        onChangeText={(v) => onChange({ gst_rate: Number(v) || 0 })}
        keyboardType="decimal-pad"
        style={[styles.input, { width: 60, textAlign: 'right' }]}
      />
      <Pressable onPress={onRemove} disabled={!canRemove} style={[styles.removeBtn, !canRemove && { opacity: 0.3 }]}>
        <Text style={styles.removeBtnText}>×</Text>
      </Pressable>
    </View>
  );
}

function LedgerPickerInline({ row, ledgers, onChange }: {
  row: LedgerRow;
  ledgers: OtherLedger[];
  onChange: (patch: Partial<LedgerRow>) => void;
}) {
  const [open, setOpen] = useState(false);
  const filtered = ledgers
    .filter((l) => !row.search || l.name.toLowerCase().includes(row.search.toLowerCase()))
    .slice(0, 12);
  return (
    <View>
      <TextInput
        value={row.search}
        onChangeText={(v) => { onChange({ search: v, ledger_id: null, ledger_name: '' }); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="Pick ledger…"
        placeholderTextColor={colors.textMuted}
        style={[styles.input, row.ledger_id !== null && styles.inputBound]}
      />
      {open && filtered.length > 0 ? (
        <View style={styles.dropdown}>
          {filtered.map((l) => (
            <Pressable
              key={l.id}
              onPress={() => { onChange({ ledger_id: l.id, ledger_name: l.name, search: l.name }); setOpen(false); }}
              style={styles.dropdownRow}
            >
              <Text style={text.value}>{l.name}</Text>
              {l.ledger_group_name ? <Text style={text.meta}>{l.ledger_group_name}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function JournalRowEditor({ row, idx, ledgers, onChange, onRemove }: {
  row: JournalRow;
  idx: number;
  ledgers: OtherLedger[];
  onChange: (patch: Partial<JournalRow>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<OtherLedger[]>([]);
  useEffect(() => {
    if (row.search.length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      voucherService.ledgerSearch(row.search).then(setResults).catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [row.search]);
  return (
    <View style={styles.tableRow}>
      <Text style={[styles.cellMeta, { width: 40 }]}>{idx + 1}</Text>
      <View style={{ width: 70 }}>
        <Pressable
          onPress={() => onChange({ drOrCr: row.drOrCr === 'Dr' ? 'Cr' : 'Dr' })}
          style={[styles.drCrPill, row.drOrCr === 'Dr' ? styles.drPill : styles.crPill]}
        >
          <Text style={[styles.drCrText, { color: row.drOrCr === 'Dr' ? colors.success : colors.brandRed }]}>{row.drOrCr}</Text>
        </Pressable>
      </View>
      <View style={{ flex: 1 }}>
        <TextInput
          value={row.search}
          onChangeText={(v) => { onChange({ search: v, ledger_id: null, ledger_name: '' }); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="Search ledger…"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, row.ledger_id !== null && styles.inputBound]}
        />
        {open && results.length > 0 ? (
          <View style={styles.dropdown}>
            {results.slice(0, 12).map((l) => (
              <Pressable
                key={l.id}
                onPress={() => { onChange({ ledger_id: l.id, ledger_name: l.name, search: l.name }); setOpen(false); }}
                style={styles.dropdownRow}
              >
                <Text style={text.value}>{l.name}</Text>
                {l.ledger_group_name ? <Text style={text.meta}>{l.ledger_group_name}</Text> : null}
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      <TextInput
        value={row.amount ? String(row.amount) : ''}
        onChangeText={(v) => onChange({ amount: Number(v) || 0 })}
        keyboardType="decimal-pad"
        style={[styles.input, { width: 130, textAlign: 'right' }]}
      />
      <Pressable onPress={onRemove} style={styles.removeBtn}>
        <Text style={styles.removeBtnText}>×</Text>
      </Pressable>
    </View>
  );
}

function BillRefRowEditor({ row, idx, pending, onChange, onRemove }: {
  row: BillRefRow;
  idx: number;
  pending: PendingRef[];
  onChange: (patch: Partial<BillRefRow>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.tableRow}>
      <Text style={[styles.cellMeta, { width: 30 }]}>{idx + 1}</Text>
      <View style={{ width: 100 }}>
        <Pressable
          onPress={() => {
            const next: BillRefRow['type'] = row.type === 'New' ? 'Agr.' : row.type === 'Agr.' ? 'On Account' : 'New';
            onChange({ type: next });
          }}
          style={styles.typeToggle}
        >
          <Text style={text.value}>{row.type}</Text>
        </Pressable>
      </View>
      {row.type === 'On Account' ? (
        <View style={{ flex: 1, paddingHorizontal: spacing.sm }}>
          <Text style={text.meta}>—</Text>
        </View>
      ) : row.type === 'Agr.' ? (
        <View style={{ flex: 1 }}>
          <TextInput
            value={row.refno}
            onChangeText={(v) => { onChange({ refno: v }); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            placeholder="Pick pending bill…"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          {open && pending.length > 0 ? (
            <View style={styles.dropdown}>
              {pending
                .filter((p) => !row.refno || p.billname.toLowerCase().includes(row.refno.toLowerCase()))
                .slice(0, 10)
                .map((p) => (
                <Pressable
                  key={p.billname}
                  onPress={() => {
                    const settle: 'Dr' | 'Cr' = p.direction === 'Dr' ? 'Cr' : 'Dr';
                    onChange({ refno: p.billname, amount: Number(p.amount), direction: settle });
                    setOpen(false);
                  }}
                  style={styles.dropdownRow}
                >
                  <Text style={text.value}>{p.billname}</Text>
                  <Text style={text.meta}>₹{fmt(Number(p.amount))} · {p.direction}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <TextInput
          value={row.refno}
          onChangeText={(v) => onChange({ refno: v })}
          placeholder="Reference / Bill No."
          placeholderTextColor={colors.textMuted}
          style={[styles.input, { flex: 1 }]}
        />
      )}
      <TextInput
        value={row.amount ? String(row.amount) : ''}
        onChangeText={(v) => onChange({ amount: Number(v) || 0 })}
        keyboardType="decimal-pad"
        style={[styles.input, { width: 110, textAlign: 'right' }]}
      />
      <Pressable
        onPress={() => onChange({ direction: row.direction === 'Dr' ? 'Cr' : 'Dr' })}
        style={[styles.drCrPill, row.direction === 'Dr' ? styles.drPill : styles.crPill, { width: 60, alignItems: 'center' }]}
      >
        <Text style={[styles.drCrText, { color: row.direction === 'Dr' ? colors.success : colors.brandRed }]}>{row.direction}</Text>
      </Pressable>
      <Pressable onPress={onRemove} style={styles.removeBtn}>
        <Text style={styles.removeBtnText}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  headerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  field: { gap: 4 },
  fieldLabel: {
    fontSize: 12,
    fontFamily: typography.uiBold,
    color: colors.textLabel,
    letterSpacing: 0.2,
  },
  partyRow: { gap: 4 },
  partyLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  partyState: { fontFamily: typography.uiMedium, color: colors.brandRed, fontSize: 11 },
  toggle: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  toggleActive: {
    borderColor: colors.brandRed,
    backgroundColor: colors.brandRedTone,
  },
  toggleText: { fontSize: 11, fontFamily: typography.uiMedium, color: colors.textLabel },
  toggleTextActive: { color: colors.brandRed, fontFamily: typography.uiBold },
  batchBtn: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.brandYellowTone,
    borderWidth: 1,
    borderColor: colors.brandYellowBorder,
  },
  batchBtnText: { fontSize: 10, fontFamily: typography.uiBold, color: colors.text, letterSpacing: 0.2 },
  partyInputWrap: { position: 'relative' },
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
  inputBound: { borderColor: colors.success, backgroundColor: '#F0FDF4' },
  inputDisabled: { backgroundColor: colors.background, color: colors.textMuted },
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginTop: 2,
    maxHeight: 280,
    zIndex: 50,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  dropdownRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
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
  chipText: { fontSize: 12, fontFamily: typography.uiMedium, color: colors.textLabel },
  chipTextActive: { color: colors.brandRed, fontFamily: typography.uiBold },
  section: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
  },
  th: { fontSize: 11, fontFamily: typography.uiBold, color: colors.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cellMeta: { fontSize: 12, color: colors.textMuted, fontFamily: typography.uiMedium, paddingTop: 10 },
  amountInput: { width: 130, textAlign: 'right' },
  removeBtn: {
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.sm,
    marginTop: 6,
  },
  removeBtnText: { color: colors.danger, fontSize: 18, fontFamily: typography.uiHeavy, lineHeight: 18 },
  addRowBtn: { paddingVertical: spacing.sm, alignItems: 'flex-start' },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    paddingVertical: 2,
  },
  subtotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    marginTop: spacing.sm,
  },
  grandTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.brandRedTone,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandRedBorder,
    marginTop: spacing.sm,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  totalsRight: { alignItems: 'flex-end' },
  errorBanner: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: { fontFamily: typography.uiBold, color: colors.danger, fontSize: 13 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  cancelBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    minHeight: 36,
    justifyContent: 'center',
  },
  drCrPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 2,
  },
  drPill: { backgroundColor: '#F0FDF4', borderColor: colors.success },
  crPill: { backgroundColor: colors.brandRedTone, borderColor: colors.brandRed },
  drCrText: { fontFamily: typography.uiBold, fontSize: 12 },
  allocateBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignSelf: 'flex-start',
  },
  typeToggle: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginTop: 2,
    alignItems: 'center',
  },
});
