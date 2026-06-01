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
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ButtonPrimary } from '../components/ButtonPrimary';
import { Loader } from '../components/Loader';
import { Modal } from '../components/Modal';
import { SelectDropdown } from '../components/SelectDropdown';
import { colors, radius, spacing, text, typography } from '../constants/theme';
import { voucherService } from '../services/voucherService';
import { vchTypeService } from '../services/vchTypeService';
import { ledgerMasterService } from '../services/ledgerMasterService';
import { itemMasterService } from '../services/itemMasterService';
import type {
  CreateVoucherRequest,
  VchType,
  OtherLedger,
  PendingRef,
  VoucherDetail,
} from '../../../shared/types/voucher';
import type { ItemMasterItem } from '../../../shared/types/itemMaster';
import type { LedgerMasterSearchResult } from '../../../shared/types/ledgerMaster';
import type { BillingStackParamList } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import { canDoAction } from '../navigation/guards';
import { useResponsive } from '../hooks/useResponsive';

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
  if (!Number.isFinite(n)) return '0';
  const s = n.toFixed(2);
  return s.endsWith('.00') ? s.slice(0, -3) : s;
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
  const { user: currentUser } = useAuth();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const editId = route.params?.id ?? null;
  const isEdit = editId !== null;
  const { isMobile } = useResponsive();

  const canSave = isEdit
    ? canDoAction(currentUser, 'voucher', 'edit')
    : canDoAction(currentUser, 'voucher', 'create');

  // The voucher's quick-add-party flow creates Sundry Debtors customers,
  // so gate it on the Customers page permission.
  const canCreateParty = canDoAction(currentUser, 'customermaster', 'create');

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
  const [partySuggestions, setPartySuggestions] = useState<LedgerMasterSearchResult[]>([]);
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

  // Wipe everything the user typed into the form. Called when:
  //   1. The active VCH TYPE changes (Sales → Purchase etc.) — each type
  //      should be its own clean form.
  //   2. The screen regains focus after the user navigated away — unsaved
  //      drafts shouldn't survive a tab change.
  // Does NOT touch vchTypeId, vchDate, vchTypes, isEdit-loaded data.
  const resetVoucherForm = useCallback(() => {
    setPartyId(null);
    setPartyName('');
    setPartyState('');
    setPartySearch('');
    setPartySuggestions([]);
    setPartyDropOpen(false);
    setIsIgst(false);
    setBillByBill(false);
    setLines([emptyLine()]);
    setLedgerRows([]);
    setJournalRows([emptyJournalRow(), emptyJournalRow()]);
    setBillRefs([]);
    setBillOpen(false);
    setPendingRefs([]);
    setBatchLineIdx(null);
    setBatchDraft([]);
    setAddPartyOpen(false);
    setPartyHighlight(0);
    setRemark('');
    setVchNo('');
    setError(null);
  }, []);

  // Reset the form on EVERY VCH TYPE change (arrow preview OR Enter commit).
  // Whatever was typed on the previous type is dropped — switching pages and
  // coming back gives a clean slate every time. Skips the initial seed and
  // edit mode.
  const prevVchTypeIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (isEdit) {
      prevVchTypeIdRef.current = vchTypeId;
      return;
    }
    const prev = prevVchTypeIdRef.current;
    if (prev === null) {
      prevVchTypeIdRef.current = vchTypeId;
      return;
    }
    if (vchTypeId !== prev) {
      resetVoucherForm();
      prevVchTypeIdRef.current = vchTypeId;
    }
  }, [vchTypeId, isEdit, resetVoucherForm]);

  // Page-level navigation: leaving the Voucher screen and re-entering wipes
  // the form so the user comes back to a clean draft.
  useFocusEffect(
    useCallback(() => {
      if (!isEdit) resetVoucherForm();
    }, [isEdit, resetVoucherForm])
  );
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
      setPartyId(v.ledger_master_id);
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
            && le.ledger_id !== v.ledger_master_id
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

  // ── Ledger autocomplete (debounced 250ms). Searches across ALL ledger
  // groups so any saved ledger name shows up in the dropdown.
  useEffect(() => {
    if (partySearch.length < 2) { setPartySuggestions([]); return; }
    const t = setTimeout(() => {
      ledgerMasterService.search(undefined, partySearch)
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
    const types = vchTypes.filter((t) => t.is_system && t.name.toLowerCase() !== 'bilty');
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

  const selectParty = async (p: LedgerMasterSearchResult) => {
    setPartyId(p.id);
    setPartyName(p.name);
    setPartySearch('');
    setPartyDropOpen(false);
    setBillRefs([]);
    try {
      const full = await ledgerMasterService.get(p.id);
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
        ledger_master_id: anchorId,
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
        ledger_master_id: partyId,
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
        // Edits go back to wherever the user came from (typically the list).
        navigation.goBack();
      } else {
        await voucherService.create(payload);
        // After creating a new voucher, stay on the form with a clean draft
        // so the user can keep entering vouchers of the same type. Refetch
        // the next voucher number explicitly — the vchTypeId effect won't
        // re-run because vchTypeId didn't change.
        resetVoucherForm();
        if (vchTypeId !== null) {
          voucherService.nextNo(vchTypeId).then(setVchNo).catch(() => { /* ignore */ });
        }
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  // Hard guard: if the user can't actually use this form (no create perm
  // when creating, no edit perm when editing), bounce them to a page they
  // CAN use. Prevents the empty form from being reachable at all.
  useEffect(() => {
    if (canSave) return;
    if (
      canDoAction(currentUser, 'daybook', 'view') ||
      canDoAction(currentUser, 'voucher', 'view')
    ) {
      navigation.replace('Daybook');
      return;
    }
    // No daybook either — pop back out of the Billing stack entirely.
    if (navigation.canGoBack()) navigation.goBack();
  }, [canSave, currentUser, navigation]);

  if (loading || !canSave) return <Loader />;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.shell}>
      <ScrollView
        style={styles.wrap}
        contentContainerStyle={[
          styles.content,
          isMobile && { paddingRight: spacing.md, paddingLeft: spacing.md, paddingTop: spacing.md },
        ]}
      >
        <View style={styles.formCard}>
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
                  {vchTypes.filter((t) => t.is_system && t.name.toLowerCase() !== 'bilty').map((t) => {
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
              style={[styles.input, !canSave && styles.inputDisabled]}
              editable={canSave}
            />
          </View>

          <View style={styles.headerSpacer} />

          <View style={[styles.field, styles.headerCol]}>
            <Text style={styles.fieldLabel}>Voucher Date</Text>
            {Platform.OS === 'web' ? (
              // Real <input type="date"> — browser renders its own calendar
              // icon at the right edge. The picker only opens via that icon
              // (or keyboard shortcut), and the date segments accept manual
              // typing. Same approach the Daybook screen uses.
              React.createElement('input', {
                ref: dateInputRef,
                type: 'date',
                value: vchDate,
                disabled: !canSave,
                onChange: (e: any) => {
                  const v = e?.target?.value || '';
                  setVchDate(v);
                  setVchDateText(fmtDateDDMMYYYY(v));
                },
                style: {
                  width: '100%',
                  boxSizing: 'border-box' as const,
                  height: 38,
                  padding: '0 12px',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  color: '#0F172A',
                  backgroundColor: canSave ? '#FFFFFF' : colors.background,
                  border: '1px solid #CBD5E1',
                  borderRadius: 6,
                  outline: 'none',
                  opacity: canSave ? 1 : 0.6,
                },
              })
            ) : (
              <Pressable
                onPress={openDatePicker}
                style={[styles.input, styles.dateField]}
                accessibilityRole="button"
                accessibilityLabel="Open date picker"
              >
                <Text style={[styles.selectText, !vchDateText && { color: colors.textMuted }]}>
                  {vchDateText || 'DD/MM/YYYY'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* PARTY — inventory mode only */}
        {!isJournalType ? (
          <View style={[styles.field, partyDropOpen && styles.fieldOpen]}>
            <Text style={styles.fieldLabel}>Ledger Name</Text>
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
                  // No onFocus open: tabbing in does not reveal the list.
                  // Typing (onChangeText above) is the only path that opens it.
                  onBlur={() => setTimeout(() => setPartyDropOpen(false), 200)}
                  placeholder="Type to search ledger..."
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, partyId !== null && styles.inputBound, !canSave && styles.inputDisabled]}
                  editable={canSave}
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
              {canCreateParty ? (
                <Pressable
                  onPress={() => setAddPartyOpen(true)}
                  style={styles.customerAddBtn}
                  accessibilityLabel="Add new ledger"
                >
                  <Text style={styles.customerAddBtnText}>+</Text>
                </Pressable>
              ) : null}
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
                editable={canSave}
              />
            ))}
            {canSave && (
              <Pressable onPress={() => setJournalRows((p) => [...p, emptyJournalRow()])} style={styles.addLink}>
                <Text style={styles.addLinkText}>+ Add Row</Text>
              </Pressable>
            )}
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
                canRemove={lines.length > 1 && canSave}
                onOpenBatch={() => openBatch(idx)}
                editable={canSave}
              />
            ))}
            {canSave && (
              <Pressable onPress={addLine} style={styles.addLink}>
                <Text style={styles.addLinkText}>+ Add Item</Text>
              </Pressable>
            )}

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
                        <LedgerPickerInline row={row} ledgers={otherLedgers} onChange={(patch) => setLedgerRows((p) => p.map((r) => r.id === row.id ? { ...r, ...patch } : r))} editable={canSave} />
                      )}
                    </View>
                    <TextInput
                      value={row.amount ? String(row.amount) : ''}
                      onChangeText={(v) => setLedgerRows((p) => p.map((r) => r.id === row.id ? { ...r, amount: Number(v) || 0 } : r))}
                      editable={!row.auto && canSave}
                      keyboardType="decimal-pad"
                      style={[styles.input, styles.amountInput, (!row.auto && canSave) ? null : styles.inputDisabled]}
                    />
                    <Pressable onPress={() => removeLedgerRow(row.id)} disabled={row.auto || !canSave} style={[styles.removeBtn, (row.auto || !canSave) && { opacity: 0.3 }]}>
                      <Text style={styles.removeBtnText}>×</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            {canSave && (
              <Pressable onPress={addLedgerRow} style={styles.addLink}>
                <Text style={styles.addLinkText}>+ Add Ledger</Text>
              </Pressable>
            )}

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
          style={[styles.input, styles.remarkInput, !canSave && styles.inputDisabled]}
          editable={canSave}
        />

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          {canSave ? (
            <ButtonPrimary
              title={isEdit ? 'Update Voucher' : '💾  Save Voucher'}
              onPress={handleSubmit}
              loading={submitting}
            />
          ) : (
            <Text style={[text.meta, { color: colors.danger }]}>
              You don't have permission to {isEdit ? 'edit' : 'create'} vouchers.
            </Text>
          )}
        </View>
        </View>
      </ScrollView>

      {/* RIGHT RAIL — VCH TYPES — desktop only; mobile uses the form's type dropdown. */}
      {Platform.OS === 'web' && !isMobile ? (
        <View style={styles.sideRail}>
          <Text style={styles.sideRailTitle}>VCH TYPES</Text>
          {vchTypes.filter((t) => t.is_system && t.name.toLowerCase() !== 'bilty').map((t, idx) => {
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
      <Modal visible={billOpen} onClose={() => setBillOpen(false)} title={`Bill Allocation — ${partyName}`} maxWidth={680}>
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          {/* Table card — header + rows wrapped in a single bordered surface */}
          <View style={styles.billCard}>
            <View style={styles.billHeaderRow}>
              <Text style={[styles.billTh, { width: 32, flexShrink: 0 }]}>#</Text>
              <Text style={[styles.billTh, { width: 130, flexShrink: 0 }]}>Type</Text>
              <Text style={[styles.billTh, { flex: 1 }]}>Ref / Bill No.</Text>
              <Text style={[styles.billTh, styles.thRight, { width: 130, flexShrink: 0 }]}>Amount</Text>
              <Text style={[styles.billTh, { width: 64, textAlign: 'center', flexShrink: 0 }]}>Dr/Cr</Text>
              <View style={{ width: 32, flexShrink: 0 }} />
            </View>
            {billRefs.map((row, idx) => (
              <BillRefRowEditor
                key={row.id}
                row={row}
                idx={idx}
                pending={pendingRefs}
                onChange={(patch) => setBillRefs((p) => p.map((r) => r.id === row.id ? { ...r, ...patch } : r))}
                onRemove={() => setBillRefs((p) => p.length > 1 ? p.filter((r) => r.id !== row.id) : p)}
                editable={canSave}
              />
            ))}
            {canSave && (
              <Pressable
                onPress={() => {
                  const used = billRefs.reduce((s, r) => s + (r.direction === 'Cr' ? -r.amount : r.amount), 0);
                  const remaining = +(signedTotal - used).toFixed(2);
                  const dir: 'Dr' | 'Cr' = remaining >= 0 ? 'Dr' : 'Cr';
                  setBillRefs((p) => [...p, { id: uid(), type: 'New', refno: '', amount: Math.abs(remaining), direction: dir }]);
                }}
                style={styles.billAddBtn}
              >
                <Text style={styles.billAddText}>+ Add Reference</Text>
              </Pressable>
            )}
          </View>

          {/* Totals strip — three labelled chunks */}
          <View style={styles.billTotalsCard}>
            <View style={styles.billTotalCell}>
              <Text style={styles.billTotalLabel}>Total</Text>
              <Text style={styles.billTotalValue}>
                ₹{fmt(effectiveTotal)} <Text style={styles.billTotalDir}>({partyDirection})</Text>
              </Text>
            </View>
            <View style={styles.billTotalDivider} />
            <View style={styles.billTotalCell}>
              <Text style={styles.billTotalLabel}>Allocated</Text>
              <Text style={[styles.billTotalValue, { color: billBalanced ? colors.success : colors.warning }]}>
                ₹{fmt(Math.abs(billAllocSigned))}
              </Text>
            </View>
            <View style={styles.billTotalDivider} />
            <View style={styles.billTotalCell}>
              <Text style={styles.billTotalLabel}>Balance</Text>
              <Text style={[styles.billTotalValue, { color: billBalanced ? colors.success : colors.warning }]}>
                ₹{fmt(Math.abs(billBalance))} {billBalanced ? '✓' : ''}
              </Text>
            </View>
          </View>

          <View>
            <ButtonPrimary title="Done" onPress={() => setBillOpen(false)} />
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

function ItemRowEditor({ line, idx, items, onChange, onRemove, canRemove, onOpenBatch, editable }: {
  line: LineItem;
  idx: number;
  items: ItemMasterItem[];
  onChange: (patch: Partial<LineItem>) => void;
  onRemove: () => void;
  canRemove: boolean;
  onOpenBatch: () => void;
  editable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(line.item_name);
  const [highlight, setHighlight] = useState(0);
  useEffect(() => { setSearch(line.item_name); }, [line.item_name]);
  const filtered = items.filter((i) => !search || i.name.toLowerCase().includes(search.toLowerCase())).slice(0, 12);
  const selectedItem = items.find((i) => i.id === line.item_id) as (ItemMasterItem & { batch?: 'Yes' | 'No' }) | undefined;
  const isBatch = selectedItem?.batch === 'Yes';
  const batchCount = line.batch_rows?.length ?? 0;

  useEffect(() => { setHighlight(0); }, [filtered.length, search]);

  // Keyboard nav inside the open item dropdown — ↑/↓ to move, Enter to pick,
  // Esc to close. Capture-phase listener so the search TextInput doesn't
  // swallow the keys.
  useEffect(() => {
    if (Platform.OS !== 'web' || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (filtered.length === 0) {
        if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((i) => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const pick = filtered[highlight];
        if (pick) {
          onChange({ item_id: pick.id, item_name: pick.name });
          setSearch(pick.name);
          setOpen(false);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, filtered, highlight, onChange]);

  return (
    <View style={[styles.tableRow, open && styles.tableRowOpen]}>
      <Text style={[styles.cellMeta, { width: 36 }]}>{idx + 1}</Text>
      <View style={{ flex: 2, minWidth: 200 }}>
        <Pressable
          onPress={() => editable && setOpen((v) => !v)}
          style={[styles.selectField, !editable && styles.inputDisabled]}
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
              {filtered.map((i, idx) => (
                <Pressable
                  key={i.id}
                  // mousedown fires before the search input's onBlur — guarantees the click lands.
                  onPressIn={() => { onChange({ item_id: i.id, item_name: i.name }); setSearch(i.name); setOpen(false); }}
                  {...(Platform.OS === 'web' ? ({ onMouseEnter: () => setHighlight(idx) } as any) : {})}
                  style={[styles.dropdownRow, idx === highlight && styles.dropdownRowHi]}
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
        style={[styles.input, { width: 80, textAlign: 'right' }, !editable && styles.inputDisabled]}
        editable={editable}
      />
      <TextInput
        value={line.rate ? String(line.rate) : ''}
        onChangeText={(v) => onChange({ rate: Number(v) || 0 })}
        keyboardType="decimal-pad"
        style={[styles.input, { width: 110, textAlign: 'right' }, !editable && styles.inputDisabled]}
        editable={editable}
      />
      <TextInput
        value={line.amount ? String(line.amount) : ''}
        editable={false}
        style={[styles.input, styles.inputDisabled, { width: 130, textAlign: 'right' }]}
      />
      {editable && (
        <Pressable onPress={onRemove} disabled={!canRemove} style={[styles.removeBtn, !canRemove && { opacity: 0.3 }]}>
          <Text style={styles.removeBtnText}>×</Text>
        </Pressable>
      )}
    </View>
  );
}

function LedgerPickerInline({ row, ledgers, onChange, editable }: {
  row: LedgerRow;
  ledgers: OtherLedger[];
  onChange: (patch: Partial<LedgerRow>) => void;
  editable: boolean;
}) {
  // Same UX as JournalRowEditor: list opens only when typing, never on focus.
  const [suppressDrop, setSuppressDrop] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const filtered = ledgers
    .filter((l) => !row.search || l.name.toLowerCase().includes(row.search.toLowerCase()))
    .slice(0, 12);

  const open =
    !suppressDrop &&
    row.ledger_id === null &&
    row.search.length >= 2 &&
    filtered.length > 0;

  useEffect(() => { setHighlight(0); }, [filtered.length, row.search]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((i) => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const pick = filtered[highlight];
        if (pick) {
          onChange({ ledger_id: pick.id, ledger_name: pick.name, search: pick.name });
          setSuppressDrop(true);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setSuppressDrop(true);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, filtered, highlight, onChange]);

  return (
    <View>
      <TextInput
        value={row.search}
        onChangeText={(v) => {
          onChange({ search: v, ledger_id: null, ledger_name: '' });
          setSuppressDrop(false);
        }}
        placeholder="Pick ledger…"
        placeholderTextColor={colors.textMuted}
        style={[styles.input, row.ledger_id !== null && styles.inputBound, !editable && styles.inputDisabled]}
        editable={editable}
      />
      {open ? (
        <View style={styles.dropdown}>
          {filtered.map((l, i) => (
            <Pressable
              key={l.id}
              {...(Platform.OS === 'web' ? ({ onMouseEnter: () => setHighlight(i) } as any) : {})}
              onPressIn={() => {
                onChange({ ledger_id: l.id, ledger_name: l.name, search: l.name });
                setSuppressDrop(true);
              }}
              style={[styles.dropdownRow, i === highlight && styles.dropdownRowHi]}
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

function JournalRowEditor({ row, idx, onChange, onRemove, editable }: {
  row: JournalRow;
  idx: number;
  onChange: (patch: Partial<JournalRow>) => void;
  onRemove: () => void;
  editable: boolean;
}) {
  const [typeOpen, setTypeOpen] = useState(false);
  const [results, setResults] = useState<OtherLedger[]>([]);
  // Suppress the dropdown after the user picks an option (so tabbing back into
  // the field doesn't immediately reopen it).
  const [suppressDrop, setSuppressDrop] = useState(false);
  // Keyboard highlight index for the open dropdown.
  const [highlight, setHighlight] = useState(0);

  // Debounced ledger search — only fires after 2+ chars typed.
  useEffect(() => {
    if (row.search.length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      voucherService.ledgerSearch(row.search).then(setResults).catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [row.search]);

  // The list opens ONLY when the user is actively typing (search has 2+
  // chars, hasn't selected yet, and isn't suppressed by a recent pick).
  // Tabbing into / clicking the field does NOT open it.
  const open =
    !suppressDrop &&
    row.ledger_id === null &&
    row.search.length >= 2 &&
    results.length > 0;

  // Reset highlight whenever the visible results change.
  useEffect(() => { setHighlight(0); }, [results.length, row.search]);

  // Web keyboard nav — capture-phase so the input doesn't swallow ↑/↓/Enter/Esc.
  useEffect(() => {
    if (Platform.OS !== 'web' || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((i) => (i + 1) % Math.min(results.length, 12));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const max = Math.min(results.length, 12);
        setHighlight((i) => (i - 1 + max) % max);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const pick = results[highlight];
        if (pick) {
          onChange({ ledger_id: pick.id, ledger_name: pick.name, search: pick.name });
          setSuppressDrop(true);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setSuppressDrop(true);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, results, highlight, onChange]);

  return (
    <View style={[styles.tableRow, (open || typeOpen) && styles.tableRowOpen]}>
      <Text style={[styles.cellMeta, { width: 36 }]}>{idx + 1}</Text>
      <View style={{ width: 70 }}>
        <Pressable
          onPress={() => editable && setTypeOpen((v) => !v)}
          style={[styles.selectField, !editable && styles.inputDisabled]}
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
          onChangeText={(v) => {
            // Re-typing invalidates the previous selection and re-arms the dropdown.
            onChange({ search: v, ledger_id: null, ledger_name: '' });
            setSuppressDrop(false);
          }}
          placeholder="Search ledger..."
          placeholderTextColor={colors.textMuted}
          style={[styles.input, row.ledger_id !== null && styles.inputBound, !editable && styles.inputDisabled]}
          editable={editable}
        />
        {open ? (
          <View style={styles.dropdown}>
            {results.slice(0, 12).map((l, i) => (
              <Pressable
                key={l.id}
                {...(Platform.OS === 'web' ? ({ onMouseEnter: () => setHighlight(i) } as any) : {})}
                onPressIn={() => {
                  onChange({ ledger_id: l.id, ledger_name: l.name, search: l.name });
                  setSuppressDrop(true);
                }}
                style={[styles.dropdownRow, i === highlight && styles.dropdownRowHi]}
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
          style={[styles.input, { width: 130, textAlign: 'right' }, !editable && styles.inputDisabled]}
          editable={editable}
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
          style={[styles.input, { width: 130, textAlign: 'right' }, !editable && styles.inputDisabled]}
          editable={editable}
        />
      ) : (
        <View style={[styles.input, styles.inputDisabled, { width: 130, alignItems: 'flex-end', justifyContent: 'center' }]}>
          <Text style={{ color: colors.textMuted }}>—</Text>
        </View>
      )}
      {editable && (
        <Pressable onPress={onRemove} style={styles.removeBtn}>
          <Text style={styles.removeBtnText}>×</Text>
        </Pressable>
      )}
    </View>
  );
}

function BillRefRowEditor({ row, idx, pending, onChange, onRemove, editable }: {
  row: BillRefRow;
  idx: number;
  pending: PendingRef[];
  onChange: (patch: Partial<BillRefRow>) => void;
  onRemove: () => void;
  editable: boolean;
}) {
  // Same UX as JournalRowEditor: list opens only when typing, never on focus.
  const [suppressDrop, setSuppressDrop] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const filtered = pending
    .filter((p) => !row.refno || p.billname.toLowerCase().includes(row.refno.toLowerCase()))
    .slice(0, 10);
  const open =
    row.type === 'Agr.' &&
    !suppressDrop &&
    row.refno.length >= 1 &&
    filtered.length > 0;

  useEffect(() => { setHighlight(0); }, [filtered.length, row.refno]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((i) => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const p = filtered[highlight];
        if (p) {
          const settle: 'Dr' | 'Cr' = p.direction === 'Dr' ? 'Cr' : 'Dr';
          onChange({ refno: p.billname, amount: Number(p.amount), direction: settle });
          setSuppressDrop(true);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setSuppressDrop(true);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, filtered, highlight, onChange]);

  return (
    <View style={styles.billBodyRow}>
      <Text style={[styles.cellMeta, { width: 32 }]}>{idx + 1}</Text>
      <View style={{ width: 130, flexShrink: 0 }}>
        <SelectDropdown
          label=""
          value={row.type}
          options={['New', 'Agr.', 'On Account']}
          onSelect={(v) => editable && onChange({ type: v as BillRefRow['type'] })}
          placeholder="Select…"
          compact
          disabled={!editable}
        />
      </View>
      {row.type === 'On Account' ? (
        <View style={{ flex: 1, paddingHorizontal: spacing.md, justifyContent: 'center', minHeight: 38 }}>
          <Text style={text.meta}>—</Text>
        </View>
      ) : row.type === 'Agr.' ? (
        <View style={{ flex: 1 }}>
          <TextInput
            value={row.refno}
            onChangeText={(v) => {
              onChange({ refno: v });
              setSuppressDrop(false);
            }}
            placeholder="Pick pending bill…"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { flex: 1 }, !editable && styles.inputDisabled]}
            editable={editable}
          />
          {open ? (
            <View style={styles.dropdown}>
              {filtered.map((p, i) => (
                <Pressable
                  key={p.billname}
                  {...(Platform.OS === 'web' ? ({ onMouseEnter: () => setHighlight(i) } as any) : {})}
                  onPressIn={() => {
                    const settle: 'Dr' | 'Cr' = p.direction === 'Dr' ? 'Cr' : 'Dr';
                    onChange({ refno: p.billname, amount: Number(p.amount), direction: settle });
                    setSuppressDrop(true);
                  }}
                  style={[styles.dropdownRow, i === highlight && styles.dropdownRowHi]}
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
          style={[styles.input, { flex: 1 }, !editable && styles.inputDisabled]}
          editable={editable}
        />
      )}
      <TextInput
        value={row.amount ? String(row.amount) : ''}
        onChangeText={(v) => onChange({ amount: Number(v) || 0 })}
        keyboardType="decimal-pad"
        style={[styles.input, { width: 130, textAlign: 'right', flexShrink: 0 }, !editable && styles.inputDisabled]}
        editable={editable}
      />
      <Pressable
        onPress={() => editable && onChange({ direction: row.direction === 'Dr' ? 'Cr' : 'Dr' })}
        style={[styles.drCrPill, row.direction === 'Dr' ? styles.drPill : styles.crPill, { width: 64, alignItems: 'center', flexShrink: 0 }, !editable && { opacity: 0.6 }]}
      >
        <Text style={[styles.drCrText, { color: row.direction === 'Dr' ? colors.success : colors.brandRed }]}>{row.direction}</Text>
      </Pressable>
      {editable && (
        <Pressable onPress={onRemove} style={[styles.removeBtn, { width: 32, flexShrink: 0 }]}>
          <Text style={styles.removeBtnText}>×</Text>
        </Pressable>
      )}
    </View>
  );
}

function AddPartyModal({ visible, onClose, onCreated }: {
  visible: boolean;
  onClose: () => void;
  onCreated: (p: LedgerMasterSearchResult) => void;
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
    if (!name.trim()) { setErr('Ledger name is required.'); return; }
    setSaving(true);
    try {
      const res = await ledgerMasterService.create({
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
    <Modal visible={visible} onClose={onClose} title="New Ledger" maxWidth={560}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <View style={{ gap: 4 }}>
          <Text style={styles.fieldLabel}>Ledger Name *</Text>
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

// Rail width tuned to fit "Credit Note" / "Debit Note" text + tight padding
// instead of stretching to ~170px and wasting horizontal real estate.
const RAIL_WIDTH = 120;
const CUSTOMER_ADD_GREEN = '#16A34A';

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: 'row', backgroundColor: colors.background },
  wrap: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingRight: Platform.OS === 'web' ? RAIL_WIDTH + spacing.lg : spacing.lg,
  },

  // Single parent card that wraps the entire voucher form. Replaces the
  // sprawling top-level layout with a contained surface — cleaner edges,
  // tighter internal spacing, and a clear separation from the page bg.
  formCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: spacing.lg,
    gap: spacing.sm,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 1px 3px rgba(15,23,42,0.06)' } as any)
      : { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 } }),
  },

  pageTitle: {
    fontSize: 22,
    fontFamily: typography.uiHeavy,
    color: colors.textStrong,
    letterSpacing: 0.2,
    marginBottom: 0,
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

  // ── Bill Allocation modal ───────────────────────────────────────────────
  billCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radius.md,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  billHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  billTh: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.uiBold,
    letterSpacing: 1,
  },
  billBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  billAddBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  billAddText: {
    color: '#16A34A',
    fontFamily: typography.uiBold,
    fontSize: 13,
  },
  billTotalsCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radius.md,
    backgroundColor: '#F8FAFC',
    overflow: 'hidden',
  },
  billTotalCell: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: 2,
  },
  billTotalLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.uiBold,
    letterSpacing: 1,
  },
  billTotalValue: {
    fontSize: 15,
    color: colors.text,
    fontFamily: typography.uiBold,
  },
  billTotalDir: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: typography.uiMedium,
  },
  billTotalDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
  },
});
