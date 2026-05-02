/**
 * VoucherFormScreen — create / edit a Tally-style voucher.
 *
 * Layout matches the Vouchers spec: header (type dropdown · vch no · date),
 * customer name row (inventory mode only), items table OR ledger Dr/Cr table,
 * grand total, remark, single Save button, and a right rail listing vch types.
 *
 * Voucher type drives sign convention via VchType.deemed_positive:
 *   YES (Sales/Debit Note)     → Party Dr, Goods Cr, inventory negative
 *   NO  (Purchase/Credit Note) → Party Cr, Goods Dr, inventory positive
 *   null (Receipt/Payment/Journal/Contra) → journal mode (Dr/Cr ledger table)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
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

function fmtDateDDMMYYYY(iso: string): string {
  // Display dates as DD/MM/YYYY in the date field while storing ISO internally.
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function parseDateDDMMYYYY(s: string): string {
  // Best-effort parse for typed input. Returns ISO if valid, else original.
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return s;
  return `${m[3]}-${m[2]}-${m[1]}`;
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
  const [vchDateText, setVchDateText] = useState<string>(fmtDateDDMMYYYY(new Date().toISOString().slice(0, 10)));
  const [remark, setRemark] = useState('');
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);

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

  // ── Batch picker modal
  const [batchLineIdx, setBatchLineIdx] = useState<number | null>(null);
  const [batchDraft, setBatchDraft] = useState<BatchDraftRow[]>([]);

  // ── Quick-add party modal
  const [addPartyOpen, setAddPartyOpen] = useState(false);
  // ── Keyboard highlight index for the party search dropdown (web only)
  const [partyHighlight, setPartyHighlight] = useState(0);
  // ── VCH TYPES right-rail keyboard navigation
  // `vchTypeId`         — which voucher type's form is currently RENDERED.
  //                       Arrow keys move this (preview).
  // `committedVchTypeId` — which rail item is shown in RED (the locked-in
  //                       selection). Updated only on Enter / mouse click.
  // `railIdx`            — which rail item shows the GREY highlight (the
  //                       arrow cursor's position).
  const [committedVchTypeId, setCommittedVchTypeId] = useState<number | null>(null);
  const [railIdx, setRailIdx] = useState<number>(-1);
  const railRefs = useRef<Array<any>>([]);
  // Ref to the first form field — focused after Enter commits a vch-type pick.
  const firstFieldRef = useRef<any>(null);
  // Timestamp of the last rail commit. The Voucher Type Pressable checks this
  // and ignores any press within ~250ms — that protects against the same Enter
  // keypress (or its keyup / browser repeat) re-triggering once focus lands.
  const lastRailCommitRef = useRef<number>(0);

  // First time vchTypeId becomes known (after vchTypes load), seed the
  // committed-id so the rail starts with the right red mark.
  useEffect(() => {
    if (vchTypeId !== null && committedVchTypeId === null) {
      setCommittedVchTypeId(vchTypeId);
    }
  }, [vchTypeId, committedVchTypeId]);
  // Ref to the hidden <input type="date"> so the visible calendar icon can
  // call showPicker() and pop the native date picker open on tap.
  const dateInputRef = useRef<any>(null);
  const openDatePicker = () => {
    const el = dateInputRef.current;
    if (el && typeof el.showPicker === 'function') {
      try { el.showPicker(); } catch { /* some browsers throw if not user-initiated */ }
    } else if (el && typeof el.focus === 'function') {
      el.focus();
    }
  };

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
          // Default landing voucher type = Sales — matches the previous behaviour
          // before the layout rewrite.
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
      const iso = (v.vch_date || '').slice(0, 10);
      setVchDate(iso);
      setVchDateText(fmtDateDDMMYYYY(iso));
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
        const igstFlag = false; // recomputed via isIgst flag effect once party state loads
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

  // ── Party autocomplete (debounced 250ms). Inventory mode → Sundry-Debtor only.
  useEffect(() => {
    if (partySearch.length < 2) { setPartySuggestions([]); return; }
    const t = setTimeout(() => {
      partyLedgerService.search(1, partySearch)
        .then((rows) => setPartySuggestions(rows))
        .catch(() => setPartySuggestions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [partySearch]);

  // Reset keyboard highlight whenever the suggestion set shifts.
  useEffect(() => { setPartyHighlight(0); }, [partySuggestions]);

  // Web keyboard nav for the right rail — GLOBAL listener so arrows work the
  // moment the page loads, even if no rail item is focused yet. Skipped when:
  //   • the user is typing inside an input / textarea (don't break editing),
  //   • another dropdown handler already called preventDefault on the event
  //     (nav-bar Ledger / Reports / Billing dropdowns capture in capture
  //     phase, so our bubble handler sees defaultPrevented=true and bails).
  // Arrow = PREVIEW: re-renders the form for the new vch type and slides the
  //                  grey highlight on the rail. The red active mark stays put.
  // Enter on a focused rail item = COMMIT (handled by Pressable.onPress →
  //                  selectVchType): flips the red mark and jumps focus to
  //                  the first form field.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const types = vchTypes.filter((t) => t.is_system);
    if (types.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const a = document.activeElement as HTMLElement | null;
      // Block arrows only when the user is actively typing in a text field.
      // Buttons, rail items, and the body all allow arrow nav of the rail.
      const isTextInput = a?.tagName === 'INPUT' || a?.tagName === 'TEXTAREA';
      if (isTextInput) return;
      e.preventDefault();
      const currentIdx = types.findIndex((t) => t.id === vchTypeId);
      const safeIdx = currentIdx >= 0 ? currentIdx : 0;
      const nextIdx = e.key === 'ArrowDown'
        ? (safeIdx + 1) % types.length
        : (safeIdx - 1 + types.length) % types.length;
      setVchTypeId(types[nextIdx].id);  // page previews
      setRailIdx(nextIdx);                // grey highlight slides
      railRefs.current[nextIdx]?.focus?.();
    };
    // Bubble phase — capture-phase listeners (TopNavBar dropdowns) run first
    // and call preventDefault, which we honour above.
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [vchTypes, vchTypeId]);

  // Commit a rail pick — flip the red active mark and jump cursor to the
  // first form field. Triggered on mouse click OR Enter on a focused rail
  // item (Pressable maps Enter → onPress via accessibilityRole="button").
  const selectVchType = (id: number) => {
    lastRailCommitRef.current = Date.now();
    setVchTypeId(id);
    setCommittedVchTypeId(id);
    setTimeout(() => firstFieldRef.current?.focus?.(), 0);
  };

  // Web keyboard nav for the party dropdown — capture-phase listener so the
  // input itself doesn't swallow ArrowUp / ArrowDown.
  useEffect(() => {
    if (Platform.OS !== 'web' || !partyDropOpen || partySuggestions.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setPartyHighlight((i) => (i + 1) % partySuggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setPartyHighlight((i) => (i - 1 + partySuggestions.length) % partySuggestions.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const pick = partySuggestions[partyHighlight];
        if (pick) selectParty(pick);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setPartyDropOpen(false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [partyDropOpen, partySuggestions, partyHighlight]);

  const selectParty = async (p: PartyLedgerSearchResult) => {
    setPartyId(p.id);
    setPartyName(p.name);
    setPartySearch('');
    setPartyDropOpen(false);
    setBillRefs([]);
    try {
      const full = await partyLedgerService.get(p.id);
      const st = full.state || '';
      setPartyState(st);
      setIsIgst(st ? st.toLowerCase() !== HOME_STATE.toLowerCase() : false);
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

  // ── Journal totals (separate Dr / Cr columns in journal layout)
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
    if (vchTypeId === null) { setError('Pick a voucher type.'); return; }

    let payload: CreateVoucherRequest;
    if (isJournalType) {
      const valid = journalRows.filter((r) => r.ledger_id && r.amount > 0);
      if (valid.length < 2) { setError('Add at least 2 ledger rows.'); return; }
      if (!journalBalanced) { setError(`Dr (${fmt(journalDr)}) must equal Cr (${fmt(journalCr)}).`); return; }
      // Journal mode does not require an explicit party; first ledger acts as anchor.
      const anchorId = partyId ?? valid[0].ledger_id!;
      if (billByBill && !billBalanced) { setError('Bill allocation must balance.'); return; }
      payload = {
        vch_type_id: vchTypeId,
        vch_no: vchNo || null,
        vch_date: vchDate || null,
        party_ledger_id: anchorId,
        remark: remark.trim() || null,
        items: [],
        ledgers: valid.map((r) => ({
          ledger_id: r.ledger_id!,
          amount: r.drOrCr === 'Dr' ? r.amount : -r.amount,
        })),
        bill_allocation: billByBill ? billRefs.map((r) => ({ type: r.type, refno: r.refno, amount: r.amount, direction: r.direction })) : undefined,
      };
    } else {
      if (!partyId) { setError('Pick a party first.'); return; }
      const validLines = lines.filter((l) => l.item_id);
      if (validLines.length === 0) { setError('Add at least one item.'); return; }
      if (billByBill && !billBalanced) { setError('Bill allocation must balance.'); return; }
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
    <View style={styles.shell}>
      <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
        <Text style={styles.pageTitle}>Vouchers</Text>

        {/* HEADER — Type dropdown · Voucher No · Voucher Date */}
        <View style={styles.headerRow}>
          <View style={[styles.field, styles.headerCol, typeMenuOpen && styles.fieldOpen]}>
            <Text style={styles.fieldLabel}>Voucher Type</Text>
            <Pressable
              ref={firstFieldRef}
              onPress={() => {
                // Swallow the carry-over from the rail's Enter that just
                // moved focus here — only open if this is a fresh user gesture.
                if (Date.now() - lastRailCommitRef.current < 250) return;
                setTypeMenuOpen((v) => !v);
              }}
              style={styles.selectField}
              accessibilityRole="button"
              accessibilityLabel="Select voucher type"
            >
              <Text style={styles.selectText}>{currentVchType?.name ?? '-- Select --'}</Text>
              <Text style={styles.caret}>{typeMenuOpen ? '▴' : '▾'}</Text>
            </Pressable>
            {typeMenuOpen ? (
              <>
                <Pressable style={styles.menuScrim} onPress={() => setTypeMenuOpen(false)} />
                <View style={styles.selectMenu}>
                  {vchTypes.filter((t) => t.is_system).map((t) => {
                    const active = vchTypeId === t.id;
                    return (
                      <Pressable
                        key={t.id}
                        onPressIn={() => { setVchTypeId(t.id); setTypeMenuOpen(false); }}
                        style={[styles.selectMenuItem, active && styles.selectMenuItemActive]}
                      >
                        <Text style={[styles.selectMenuItemText, active && styles.selectMenuItemTextActive]}>{t.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
          </View>

          <View style={[styles.field, styles.headerCol]}>
            <Text style={styles.fieldLabel}>Voucher No</Text>
            <TextInput
              value={vchNo}
              onChangeText={setVchNo}
              placeholder="P-001"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
          </View>

          <View style={styles.headerSpacer} />

          <View style={[styles.field, styles.headerCol]}>
            <Text style={styles.fieldLabel}>Voucher Date</Text>
            <View style={styles.dateWrap}>
              {/* Visible field — Pressable so clicks reliably fire openDatePicker(). */}
              <Pressable
                onPress={openDatePicker}
                style={[styles.input, styles.dateField]}
                accessibilityRole="button"
                accessibilityLabel="Open date picker"
              >
                <Text style={[styles.selectText, !vchDateText && { color: colors.textMuted }]}>
                  {vchDateText || 'DD/MM/YYYY'}
                </Text>
                <Text style={styles.dateIcon}>📅</Text>
              </Pressable>
              {/* Real HTML <input type="date"> rendered via createElement so the
                  ref is a true HTMLInputElement (RN-Web's TextInput ref isn't).
                  Tucked off-screen with pointer-events:none so it never blocks
                  clicks on the visible Pressable. */}
              {Platform.OS === 'web'
                ? React.createElement('input', {
                    ref: dateInputRef,
                    type: 'date',
                    value: vchDate,
                    onChange: (e: any) => {
                      const v = e?.target?.value || '';
                      setVchDate(v);
                      setVchDateText(fmtDateDDMMYYYY(v));
                    },
                    'aria-hidden': 'true',
                    tabIndex: -1,
                    style: {
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: 1,
                      height: 1,
                      opacity: 0,
                      pointerEvents: 'none',
                      border: 'none',
                      padding: 0,
                      margin: 0,
                      background: 'transparent',
                    } as any,
                  })
                : null}
            </View>
          </View>
        </View>

        {/* PARTY — inventory mode only */}
        {!isJournalType ? (
          <View style={[styles.field, partyDropOpen && styles.fieldOpen]}>
            <Text style={styles.fieldLabel}>Party Name</Text>
            <View style={styles.customerRow}>
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
                  placeholder="Type to search party..."
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, partyId !== null && styles.inputBound]}
                />
                {partyDropOpen && partySuggestions.length > 0 ? (
                  <View style={styles.dropdown}>
                    {partySuggestions.slice(0, 12).map((p, idx) => {
                      const hi = idx === partyHighlight;
                      return (
                        <Pressable
                          key={p.id}
                          // onPressIn (mousedown) fires BEFORE the input's
                          // onBlur, so the click always registers — fixes the
                          // "click does nothing" bug.
                          onPressIn={() => selectParty(p)}
                          {...(Platform.OS === 'web' ? ({ onMouseEnter: () => setPartyHighlight(idx) } as any) : {})}
                          style={[styles.dropdownRow, hi && styles.dropdownRowHi]}
                        >
                          <Text style={text.value}>{p.name}</Text>
                          {p.city ? <Text style={text.meta}>{p.city}</Text> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
              <Pressable
                onPress={() => setAddPartyOpen(true)}
                style={styles.customerAddBtn}
                accessibilityLabel="Add new party"
              >
                <Text style={styles.customerAddBtnText}>+</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* BODY — Items table OR Ledger Dr/Cr table */}
        {isJournalType ? (
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { width: 36 }]}>#</Text>
              <Text style={[styles.th, { width: 70 }]}>TYPE</Text>
              <Text style={[styles.th, { flex: 1 }]}>LEDGER</Text>
              <Text style={[styles.th, styles.thRight, { width: 130 }]}>DR AMOUNT</Text>
              <Text style={[styles.th, styles.thRight, { width: 130 }]}>CR AMOUNT</Text>
              <View style={{ width: 28 }} />
            </View>
            {journalRows.map((row, idx) => (
              <JournalRowEditor
                key={row.id}
                row={row}
                idx={idx}
                onChange={(patch) => setJournalRows((p) => p.map((r) => r.id === row.id ? { ...r, ...patch } : r))}
                onRemove={() => setJournalRows((p) => p.length > 2 ? p.filter((r) => r.id !== row.id) : p)}
              />
            ))}
            <Pressable onPress={() => setJournalRows((p) => [...p, emptyJournalRow()])} style={styles.addLink}>
              <Text style={styles.addLinkText}>+ Add Row</Text>
            </Pressable>
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Grand Total</Text>
              <View style={styles.grandTotalDualWrap}>
                <Text style={[styles.grandTotalValue, { width: 130 }]}>{fmt(journalDr)}</Text>
                <Text style={[styles.grandTotalValue, { width: 130 }]}>{fmt(journalCr)}</Text>
                <View style={{ width: 28 }} />
              </View>
            </View>
            {!journalBalanced ? (
              <Text style={styles.balanceWarn}>
                Dr and Cr must match · diff ₹{fmt(Math.abs(journalDr - journalCr))}
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.tableCard}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { width: 36 }]}>#</Text>
              <Text style={[styles.th, { flex: 2, minWidth: 200 }]}>ITEM</Text>
              <Text style={[styles.th, styles.thRight, { width: 80 }]}>QTY</Text>
              <Text style={[styles.th, styles.thRight, { width: 110 }]}>RATE</Text>
              <Text style={[styles.th, styles.thRight, { width: 130 }]}>AMOUNT</Text>
              <View style={{ width: 28 }} />
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
            <Pressable onPress={addLine} style={styles.addLink}>
              <Text style={styles.addLinkText}>+ Add Item</Text>
            </Pressable>

            <View style={styles.itemTotalRow}>
              <Text style={styles.itemTotalLabel}>ITEM TOTAL</Text>
              <Text style={styles.itemTotalValue}>{fmt(subtotal)}</Text>
            </View>

            {ledgerRows.length > 0 ? (
              <View style={styles.ledgerSection}>
                {ledgerRows.map((row) => (
                  <View key={row.id} style={styles.ledgerRow}>
                    <Text style={[styles.cellMeta, { width: 36 }]}>·</Text>
                    <View style={{ flex: 1, minWidth: 200 }}>
                      {row.auto ? (
                        <Text style={text.value}>{row.ledger_name} <Text style={text.meta}>(auto)</Text></Text>
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
              </View>
            ) : null}

            <Pressable onPress={addLedgerRow} style={styles.addLink}>
              <Text style={styles.addLinkText}>+ Add Ledger</Text>
            </Pressable>

            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Grand Total</Text>
              {billByBill ? (
                <Pressable onPress={openBillAlloc}>
                  <Text style={[styles.grandTotalValue, { color: billBalanced ? colors.success : colors.warning, textDecorationLine: 'underline' }]}>
                    {fmt(grandTotal)} {billBalanced ? '✓' : '· allocate'}
                  </Text>
                </Pressable>
              ) : (
                <Text style={styles.grandTotalValue}>{fmt(grandTotal)}</Text>
              )}
            </View>
          </View>
        )}

        {/* REMARK */}
        <TextInput
          value={remark}
          onChangeText={setRemark}
          placeholder="Remark (optional)"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, styles.remarkInput]}
        />

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <ButtonPrimary
            title={isEdit ? 'Update Voucher' : '💾  Save Voucher'}
            onPress={handleSubmit}
            loading={submitting}
          />
        </View>
      </ScrollView>

      {/* RIGHT RAIL — VCH TYPES */}
      {Platform.OS === 'web' ? (
        <View style={styles.sideRail}>
          <Text style={styles.sideRailTitle}>VCH TYPES</Text>
          {vchTypes.filter((t) => t.is_system).map((t, idx) => {
            // Red = committed (Enter / click). Grey = highlighted by arrow.
            const active = committedVchTypeId === t.id;
            const focused = railIdx === idx;
            return (
              <Pressable
                key={t.id}
                ref={(el) => { railRefs.current[idx] = el; }}
                onPress={() => selectVchType(t.id)}
                onFocus={() => setRailIdx(idx)}
                onBlur={() => {
                  // Defer so we can check whether focus moved to ANOTHER rail
                  // item (arrow nav) vs left the rail entirely (Tab away).
                  setTimeout(() => {
                    const a = (typeof document !== 'undefined' ? document.activeElement : null) as any;
                    if (!railRefs.current.some((el) => el === a)) setRailIdx(-1);
                  }, 0);
                }}
                style={[
                  styles.sideRailItem,
                  focused && !active && styles.sideRailItemHover,
                  active && styles.sideRailItemActive,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Switch to ${t.name} voucher`}
              >
                <Text style={[styles.sideRailItemText, active && styles.sideRailItemTextActive]}>{t.name}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {/* BILL ALLOCATION MODAL */}
      <Modal visible={billOpen} onClose={() => setBillOpen(false)} title={`Bill Allocation — ${partyName}`} maxWidth={620}>
        <View style={{ padding: spacing.md }}>
          <View style={styles.tableHeader}>
            <Text style={[styles.th, { width: 30 }]}>#</Text>
            <Text style={[styles.th, { width: 100 }]}>Type</Text>
            <Text style={[styles.th, { flex: 1 }]}>Ref / Bill No.</Text>
            <Text style={[styles.th, styles.thRight, { width: 110 }]}>Amount</Text>
            <Text style={[styles.th, { width: 60, textAlign: 'center' }]}>Dr/Cr</Text>
            <View style={{ width: 30 }} />
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
            style={styles.addLink}
          >
            <Text style={styles.addLinkText}>+ Add Reference</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm }}>
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

      {/* QUICK-ADD PARTY MODAL */}
      <AddPartyModal
        visible={addPartyOpen}
        onClose={() => setAddPartyOpen(false)}
        onCreated={(p) => {
          setAddPartyOpen(false);
          // Auto-select the freshly-created party — reuses selectParty so
          // state/IGST/billbybill are populated the same way.
          selectParty(p);
        }}
      />

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
            <Text style={[styles.th, styles.thRight, { width: 70 }]}>Qty</Text>
            <Text style={[styles.th, styles.thRight, { width: 100 }]}>Rate</Text>
            <Text style={[styles.th, styles.thRight, { width: 110 }]}>Amount</Text>
            <View style={{ width: 30 }} />
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
            style={styles.addLink}
          >
            <Text style={styles.addLinkText}>+ Add Batch</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm }}>
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
    </View>
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
    <View style={[styles.tableRow, open && styles.tableRowOpen]}>
      <Text style={[styles.cellMeta, { width: 36 }]}>{idx + 1}</Text>
      <View style={{ flex: 2, minWidth: 200 }}>
        <Pressable
          onPress={() => setOpen((v) => !v)}
          style={styles.selectField}
          accessibilityRole="button"
          accessibilityLabel="Select item"
        >
          <Text style={[styles.selectText, !line.item_id && { color: colors.textMuted }]}>
            {line.item_id ? line.item_name : '-- Select Item --'}
          </Text>
          <Text style={styles.caret}>▾</Text>
        </Pressable>
        {open ? (
          <>
            <Pressable style={styles.menuScrim} onPress={() => setOpen(false)} />
            <View style={[styles.dropdown, { padding: 6 }]}>
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search items…"
                placeholderTextColor={colors.textMuted}
                autoFocus
                style={[styles.input, { marginBottom: 4 }]}
              />
              {filtered.map((i) => (
                <Pressable
                  key={i.id}
                  // mousedown fires before the search input's onBlur — guarantees the click lands.
                  onPressIn={() => { onChange({ item_id: i.id, item_name: i.name }); setSearch(i.name); setOpen(false); }}
                  style={styles.dropdownRow}
                >
                  <Text style={text.value}>{i.name}</Text>
                  {i.gst_rate ? <Text style={text.meta}>GST {i.gst_rate}%</Text> : null}
                </Pressable>
              ))}
              {filtered.length === 0 ? (
                <Text style={[text.meta, { padding: spacing.sm }]}>No matches</Text>
              ) : null}
            </View>
          </>
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
        style={[styles.input, { width: 80, textAlign: 'right' }]}
      />
      <TextInput
        value={line.rate ? String(line.rate) : ''}
        onChangeText={(v) => onChange({ rate: Number(v) || 0 })}
        keyboardType="decimal-pad"
        style={[styles.input, { width: 110, textAlign: 'right' }]}
      />
      <TextInput
        value={line.amount ? String(line.amount) : ''}
        editable={false}
        style={[styles.input, styles.inputDisabled, { width: 130, textAlign: 'right' }]}
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
              onPressIn={() => { onChange({ ledger_id: l.id, ledger_name: l.name, search: l.name }); setOpen(false); }}
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

function JournalRowEditor({ row, idx, onChange, onRemove }: {
  row: JournalRow;
  idx: number;
  onChange: (patch: Partial<JournalRow>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [results, setResults] = useState<OtherLedger[]>([]);
  useEffect(() => {
    if (row.search.length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      voucherService.ledgerSearch(row.search).then(setResults).catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [row.search]);
  return (
    <View style={[styles.tableRow, (open || typeOpen) && styles.tableRowOpen]}>
      <Text style={[styles.cellMeta, { width: 36 }]}>{idx + 1}</Text>
      <View style={{ width: 70 }}>
        <Pressable
          onPress={() => setTypeOpen((v) => !v)}
          style={styles.selectField}
          accessibilityRole="button"
          accessibilityLabel="Dr or Cr"
        >
          <Text style={styles.selectText}>{row.drOrCr}</Text>
          <Text style={styles.caret}>▾</Text>
        </Pressable>
        {typeOpen ? (
          <>
            <Pressable style={styles.menuScrim} onPress={() => setTypeOpen(false)} />
            <View style={styles.dropdown}>
              {(['Dr', 'Cr'] as const).map((dc) => (
                <Pressable
                  key={dc}
                  onPressIn={() => { onChange({ drOrCr: dc }); setTypeOpen(false); }}
                  style={styles.dropdownRow}
                >
                  <Text style={text.value}>{dc}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <TextInput
          value={row.search}
          onChangeText={(v) => { onChange({ search: v, ledger_id: null, ledger_name: '' }); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="Search ledger..."
          placeholderTextColor={colors.textMuted}
          style={[styles.input, row.ledger_id !== null && styles.inputBound]}
        />
        {open && results.length > 0 ? (
          <View style={styles.dropdown}>
            {results.slice(0, 12).map((l) => (
              <Pressable
                key={l.id}
                onPressIn={() => { onChange({ ledger_id: l.id, ledger_name: l.name, search: l.name }); setOpen(false); }}
                style={styles.dropdownRow}
              >
                <Text style={text.value}>{l.name}</Text>
                {l.ledger_group_name ? <Text style={text.meta}>{l.ledger_group_name}</Text> : null}
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      {row.drOrCr === 'Dr' ? (
        <TextInput
          value={row.amount ? String(row.amount) : ''}
          onChangeText={(v) => onChange({ amount: Number(v) || 0 })}
          keyboardType="decimal-pad"
          style={[styles.input, { width: 130, textAlign: 'right' }]}
        />
      ) : (
        <View style={[styles.input, styles.inputDisabled, { width: 130, alignItems: 'flex-end', justifyContent: 'center' }]}>
          <Text style={{ color: colors.textMuted }}>—</Text>
        </View>
      )}
      {row.drOrCr === 'Cr' ? (
        <TextInput
          value={row.amount ? String(row.amount) : ''}
          onChangeText={(v) => onChange({ amount: Number(v) || 0 })}
          keyboardType="decimal-pad"
          style={[styles.input, { width: 130, textAlign: 'right' }]}
        />
      ) : (
        <View style={[styles.input, styles.inputDisabled, { width: 130, alignItems: 'flex-end', justifyContent: 'center' }]}>
          <Text style={{ color: colors.textMuted }}>—</Text>
        </View>
      )}
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
                  onPressIn={() => {
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

function AddPartyModal({ visible, onClose, onCreated }: {
  visible: boolean;
  onClose: () => void;
  onCreated: (p: PartyLedgerSearchResult) => void;
}) {
  const [name, setName] = useState('');
  const [gstNo, setGstNo] = useState('');
  const [panNo, setPanNo] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');
  const [pincode, setPincode] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset every field whenever the modal closes so it opens clean next time.
  useEffect(() => {
    if (!visible) {
      setName(''); setGstNo(''); setPanNo(''); setAddress('');
      setCity(''); setState(''); setCountry(''); setPincode('');
      setErr(null); setSaving(false);
    }
  }, [visible]);

  const onSave = async () => {
    setErr(null);
    if (!name.trim()) { setErr('Party name is required.'); return; }
    setSaving(true);
    try {
      const res = await partyLedgerService.create({
        ledger_group_id: 1, // Sundry Debtors — voucher form party context
        name: name.trim(),
        gst_no: gstNo.trim() || null,
        pan_no: panNo.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        country: country.trim() || null,
        pincode: pincode.trim() || null,
      });
      onCreated({
        id: res.id,
        ledger_group_id: 1,
        name: name.trim(),
        city: city.trim() || null,
        gst_no: gstNo.trim() || null,
      });
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} onClose={onClose} title="New Party" maxWidth={560}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <View style={{ gap: 4 }}>
          <Text style={styles.fieldLabel}>Party Name *</Text>
          <TextInput value={name} onChangeText={setName} autoFocus style={styles.input} />
        </View>

        <View style={{ gap: 4 }}>
          <Text style={styles.fieldLabel}>GST No</Text>
          <TextInput
            value={gstNo}
            onChangeText={setGstNo}
            autoCapitalize="characters"
            placeholder="22AAAAA0000A1Z5"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
        </View>

        <View style={{ gap: 4 }}>
          <Text style={styles.fieldLabel}>PAN No</Text>
          <TextInput
            value={panNo}
            onChangeText={setPanNo}
            autoCapitalize="characters"
            placeholder="AAAAA0000A"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
        </View>

        <View style={{ gap: 4 }}>
          <Text style={styles.fieldLabel}>Address</Text>
          <TextInput value={address} onChangeText={setAddress} style={styles.input} />
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.fieldLabel}>City</Text>
            <TextInput value={city} onChangeText={setCity} style={styles.input} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.fieldLabel}>State</Text>
            <TextInput value={state} onChangeText={setState} style={styles.input} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.fieldLabel}>Country</Text>
            <TextInput value={country} onChangeText={setCountry} style={styles.input} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.fieldLabel}>Pincode</Text>
            <TextInput value={pincode} onChangeText={setPincode} keyboardType="number-pad" style={styles.input} />
          </View>
        </View>

        {err ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{err}</Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs }}>
          <Pressable onPress={onClose}>
            <Text style={[text.action, { color: colors.textMuted, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }]}>Cancel</Text>
          </Pressable>
          <ButtonPrimary title="Create party" onPress={onSave} loading={saving} />
        </View>
      </View>
    </Modal>
  );
}

const RAIL_WIDTH = 170;
const CUSTOMER_ADD_GREEN = '#16A34A';

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', backgroundColor: colors.background },
  wrap: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingRight: Platform.OS === 'web' ? RAIL_WIDTH + spacing.lg : spacing.lg,
    gap: spacing.md,
  },
  pageTitle: {
    fontSize: 22,
    fontFamily: typography.uiHeavy,
    color: colors.textStrong,
    letterSpacing: 0.2,
    marginBottom: spacing.xs,
  },

  // ── Header row
  headerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: spacing.md,
    // High z-index always so any dropdown opened from a field inside this row
    // (Voucher Type select) renders OVER the Party Name section and items
    // table that come later in the DOM. Without this, the menu's z-index is
    // trapped inside headerRow's stacking context (z-index auto), and later
    // siblings paint on top of it.
    ...(Platform.OS === 'web' ? ({ position: 'relative', zIndex: 1000 } as any) : {}),
  },
  headerCol: { minWidth: 180, flexBasis: 200, flexGrow: 0 },
  headerSpacer: { flex: 1 },

  field: {
    gap: 4,
    // ALWAYS position:relative so absolute-positioned dropdowns inside this
    // container are anchored to it (not to a far-away ancestor like the
    // ScrollView, which would render them at the bottom of the page).
    ...(Platform.OS === 'web' ? ({ position: 'relative' } as any) : {}),
  },
  // Lift the container above siblings rendered after it in document order.
  fieldOpen: Platform.OS === 'web' ? ({ zIndex: 9999 } as any) : {},
  fieldLabel: {
    fontSize: 12,
    fontFamily: typography.uiMedium,
    color: colors.textMuted,
    letterSpacing: 0.2,
  },

  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    fontSize: 14,
    fontFamily: typography.uiMedium,
    color: colors.text,
    minHeight: 38,
  },
  inputBound: { borderColor: colors.success, backgroundColor: '#F0FDF4' },
  inputDisabled: { backgroundColor: colors.background, color: colors.textMuted },

  // ── Select-style dropdowns (voucher type, item picker, Dr/Cr type)
  selectField: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  selectText: {
    fontSize: 14,
    fontFamily: typography.uiMedium,
    color: colors.text,
  },
  caret: { color: colors.textMuted, fontSize: 11 },
  selectMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    marginTop: 4,
    paddingVertical: 4,
    zIndex: 99999,
    elevation: 24,
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  selectMenuItem: { paddingHorizontal: spacing.md, paddingVertical: 8 },
  selectMenuItemActive: { backgroundColor: colors.brandRedTone },
  selectMenuItemText: { fontSize: 13, fontFamily: typography.uiMedium, color: colors.text },
  selectMenuItemTextActive: { color: colors.brandRed, fontFamily: typography.uiBold },
  menuScrim: {
    // On web: fixed so it covers the full viewport without adding any scroll
    // area (the -2000 trick creates implicit scrollable space and shifts layout).
    ...(Platform.OS === 'web'
      ? ({ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 } as any)
      : { position: 'absolute', top: -2000, left: -2000, right: -2000, bottom: -2000 }),
    zIndex: 55,
  },

  // ── Date input
  dateWrap: { position: 'relative' },
  // Visible field — same shape as `input` but renders the date as text and
  // routes taps to openDatePicker() rather than typing.
  dateField: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 38, // leave room for the calendar icon button
  },
  // Calendar icon button overlaid on the right edge of the visible field.
  dateIconBtn: {
    position: 'absolute',
    right: 4,
    top: 4,
    bottom: 4,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  dateIcon: {
    fontSize: 16,
    color: colors.textMuted,
  },
  // Hidden native <input type="date"> — kept off-screen but reachable via ref
  // so showPicker() / focus() can open the OS date picker on demand.
  dateHidden: Platform.OS === 'web' ? ({
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
    pointerEvents: 'none',
    border: 'none',
    padding: 0,
    margin: 0,
  } as any) : { width: 0, height: 0, opacity: 0 },

  // ── Customer name row
  customerRow: { flexDirection: 'row', alignItems: 'stretch', gap: spacing.sm },
  partyInputWrap: { position: 'relative', flex: 1 },
  customerAddBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: CUSTOMER_ADD_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAddBtnText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontFamily: typography.uiHeavy,
    lineHeight: 22,
  },

  // ── Tables
  tableCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    // No overflow:hidden — would clip absolute-positioned dropdowns inside row cells.
    ...(Platform.OS === 'web' ? ({ overflow: 'visible' } as any) : {}),
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  th: {
    fontSize: 11,
    fontFamily: typography.uiBold,
    color: colors.textMuted,
    letterSpacing: 0.6,
  },
  thRight: { textAlign: 'right' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...(Platform.OS === 'web' ? ({ position: 'relative', zIndex: 1 } as any) : {}),
  },
  // Bump z-index sky-high while a child dropdown is open so it floats above
  // every sibling row and the bordered table card chrome.
  tableRowOpen: Platform.OS === 'web' ? ({ zIndex: 9999 } as any) : {},
  cellMeta: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: typography.uiMedium,
    paddingTop: 11,
  },
  amountInput: { width: 130, textAlign: 'right' },
  removeBtn: {
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
    borderRadius: radius.sm,
    marginTop: 6,
  },
  removeBtnText: {
    color: colors.danger,
    fontSize: 18,
    fontFamily: typography.uiHeavy,
    lineHeight: 18,
  },

  addLink: {
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    alignItems: 'flex-start',
  },
  addLinkText: {
    color: '#16A34A',
    fontSize: 13,
    fontFamily: typography.uiBold,
  },

  // ── Item total row (between items table and ledger area)
  itemTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  itemTotalLabel: {
    fontSize: 11,
    fontFamily: typography.uiBold,
    color: colors.textMuted,
    letterSpacing: 0.6,
  },
  itemTotalValue: {
    fontSize: 14,
    fontFamily: typography.uiBold,
    color: colors.text,
    paddingRight: 28 + spacing.sm,
  },

  ledgerSection: {
    paddingHorizontal: 0,
  },
  ledgerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },

  // ── Grand total row
  grandTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  grandTotalLabel: {
    fontSize: 15,
    fontFamily: typography.uiHeavy,
    color: colors.textStrong,
  },
  grandTotalValue: {
    fontSize: 16,
    fontFamily: typography.uiHeavy,
    color: '#2563EB',
    textAlign: 'right',
    paddingRight: 28 + spacing.sm,
  },
  grandTotalDualWrap: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  balanceWarn: {
    paddingHorizontal: spacing.md,
    paddingBottom: 10,
    color: colors.warning,
    fontSize: 12,
    fontFamily: typography.uiMedium,
    textAlign: 'right',
  },

  remarkInput: { minHeight: 42 },

  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  errorText: { fontFamily: typography.uiBold, color: colors.danger, fontSize: 13 },

  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.sm,
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

  // ── Right rail
  sideRail: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    width: RAIL_WIDTH,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  sideRailTitle: {
    fontSize: 11,
    fontFamily: typography.uiBold,
    color: colors.textMuted,
    letterSpacing: 0.8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  sideRailItem: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 9,
    borderRadius: radius.sm,
    // Suppress browser focus outline — keyboard hover state is shown via the
    // grey background instead (matches the nav bar dropdown pattern).
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  // Grey highlight when an item is keyboard-focused (arrow-navigated) but not
  // the current voucher type. Same #EEF2F7 used by AutocompleteField.
  sideRailItemHover: {
    backgroundColor: '#EEF2F7',
  },
  sideRailItemActive: {
    backgroundColor: colors.brandRed,
  },
  sideRailItemText: {
    fontSize: 13,
    fontFamily: typography.uiMedium,
    color: colors.text,
  },
  sideRailItemTextActive: {
    color: '#FFFFFF',
    fontFamily: typography.uiBold,
  },

  // ── Dropdowns (autocomplete)
  dropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    marginTop: 4,
    maxHeight: 280,
    zIndex: 99999,
    elevation: 24,
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
  // Keyboard / mouse hover highlight — same light grey used by AutocompleteField.
  dropdownRowHi: { backgroundColor: '#EEF2F7' },

  // ── Batch button (small chip under item picker)
  batchBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.brandYellowTone,
    borderWidth: 1,
    borderColor: colors.brandYellowBorder,
  },
  batchBtnText: { fontSize: 10, fontFamily: typography.uiBold, color: colors.text, letterSpacing: 0.2 },

  // ── Bill allocation modal helpers
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
