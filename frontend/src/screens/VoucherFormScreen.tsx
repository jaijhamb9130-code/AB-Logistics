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
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PrefixedNumberInput } from '../components/PrefixedNumberInput';
import { SelectDropdown } from '../components/SelectDropdown';
import { AutocompleteField } from '../components/AutocompleteField';
import { Toast } from '../components/Toast';
import { colors, radius, spacing, text, typography } from '../constants/theme';
import { voucherService } from '../services/voucherService';
import { vchTypeService } from '../services/vchTypeService';
import { biltyService } from '../services/biltyService';
import { BiltyCreateFormEmbedded } from './BiltyFormScreen';
import { ledgerMasterService } from '../services/ledgerMasterService';
import { itemMasterService } from '../services/itemMasterService';
import type {
  CreateVoucherRequest,
  VchType,
  OtherLedger,
  PendingRef,
  VoucherDetail,
  BiltyBudget,
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
  // Editing a Bilty in-place on the Vouchers page (from a Day Book Bilty /
  // Freight Journal row). Renders the embedded Bilty form in edit mode.
  const biltyEditId = route.params?.biltyEditId ?? null;
  // Any edit context — guards voucher-type switching (arrows disabled; rail
  // click asks for confirmation before discarding the loaded voucher).
  const inEditMode = isEdit || biltyEditId !== null;
  const { isMobile } = useResponsive();

  const canSave = (isEdit || biltyEditId !== null)
    ? canDoAction(currentUser, 'voucher', 'edit') || canDoAction(currentUser, 'bilty', 'edit')
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
  // Keyboard highlight index within the open Voucher Type dropdown (family list).
  const [typeMenuHighlight, setTypeMenuHighlight] = useState(0);
  // Mobile-only: open/closed state for the compact top-right primary-type box.
  // Independent of `typeMenuOpen` (the family dropdown).
  const [primaryMenuOpen, setPrimaryMenuOpen] = useState(false);

  // Bilty sub-type picker — only shown when the Bilty primary is active. Lets
  // the user pick "Bilty" itself or one of its child types. The pick drives
  // ONLY the prefix on the embedded bilty's "Bilty No" field (no prefix → the
  // prefix box disappears and numbering starts directly).
  // The picker's text is the single source of truth. The selected type (and so
  // the prefix/branch/key) is DERIVED from it — blank or non-matching text means
  // "no type", which clears the bilty no/branch and drops the prefix.
  const [biltyTypeText, setBiltyTypeText] = useState('');

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

  // ── Advance / Fuel sub-mode (Contra/Journal/Payment/Receipt only).
  // 0 = normal, 1 = advance, 2 = fuel. When advance/fuel is active, a Bilty No
  // search field appears; selecting a bilty auto-fills + locks its owner into
  // journal row 1.
  const [biltyMode, setBiltyMode] = useState<0 | 1 | 2>(0);
  const [biltyModeMenuOpen, setBiltyModeMenuOpen] = useState(false);
  // Grey-highlight index for keyboard nav inside the Mode dropdown (0/1/2).
  const [biltyModeHighlight, setBiltyModeHighlight] = useState(0);
  const [biltyList, setBiltyList] = useState<{ id: number; bilty_no: string }[]>([]);
  const [biltyNoText, setBiltyNoText] = useState('');
  // Advance: true once a bilty is picked and its truck is locked into row 1.
  const [biltyLocked, setBiltyLocked] = useState(false);
  // Mirror of biltyLocked readable inside effects without widening their deps.
  const biltyLockedRef = useRef(false);
  useEffect(() => { biltyLockedRef.current = biltyLocked; }, [biltyLocked]);
  // Id of the currently selected bilty (both modes). Fuel uses it to switch
  // row 1 into the Fuel-group ledger dropdown once a bilty is chosen.
  const [selectedBiltyId, setSelectedBiltyId] = useState<number | null>(null);
  // Advance/Fuel spend cap for the selected bilty (transport total / used /
  // remaining). Drives the on-form banner and the client-side save block;
  // the same cap is enforced server-side.
  const [biltyBudget, setBiltyBudget] = useState<BiltyBudget | null>(null);
  // True while an edit is being hydrated with a restored bilty — keeps the
  // advance/fuel effect from resetting/relocking the already-loaded ledger
  // rows. Cleared the moment the user interacts (types a bilty no / changes
  // mode), so normal behaviour resumes.
  const suppressBiltyHydrateRef = useRef(false);

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
  // In edit mode, a rail click stages the target type here and opens a confirm
  // dialog (switching discards the loaded voucher) instead of switching outright.
  const [pendingTypeId, setPendingTypeId] = useState<number | null>(null);
  const [railIdx, setRailIdx] = useState<number>(-1);
  const railRefs = useRef<Array<any>>([]);
  // Ref to the first form field — focused after Enter commits a vch-type pick.
  const firstFieldRef = useRef<any>(null);
  // Ref to the Bilty-type picker — focused (instead of firstFieldRef) when the
  // committed type is Bilty, so the rail's Enter lands on the Bilty Type field.
  const biltyTypeRef = useRef<{ focus: () => void } | null>(null);
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
    setBiltyMode(0);
    setBiltyModeMenuOpen(false);
    setBiltyNoText('');
    setBiltyLocked(false);
    biltyLockedRef.current = false;
    setSelectedBiltyId(null);
    setBiltyBudget(null);
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

  // For Freight Journal edits — shows "Against Bilty: <bilty_no>" in the header.
  const [parentBiltyNo, setParentBiltyNo] = useState<string | null>(null);

  // ── State flags
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One-shot success toast shown on the form after a create (the form stays
  // open for the next entry). Updates navigate to the Daybook and show the
  // toast there instead.
  const [notice, setNotice] = useState<string | null>(null);

  // ── Derived
  const currentVchType = vchTypes.find((t) => t.id === vchTypeId) || null;
  // Root primary of the current selection: a primary self-references (parent_id
  // === id) so this yields the primary for both primaries and their children.
  // Drives the Type dropdown (shows the primary + its children) and the rail
  // highlight (the active family's primary stays lit even when a child is set).
  const familyRootId = currentVchType ? (currentVchType.parent_id ?? currentVchType.id) : null;
  // The voucher Type dropdown shows the active primary + its children.
  // When editing a Freight Journal: show only that one type (no switching).
  // Otherwise: hide Freight Journal from the Journal-family dropdown.
  const isFreightJournalEdit = currentVchType?.name === 'Freight Journal';
  const familyTypes = isFreightJournalEdit
    ? [currentVchType!]
    : vchTypes.filter((t) => t.parent_id === familyRootId && t.name !== 'Freight Journal');
  // Root primary of the COMMITTED type — drives the rail's RED mark. Arrow-
  // previewing changes vchTypeId (grey) but not the commit, so red stays put.
  const committedType = vchTypes.find((t) => t.id === committedVchTypeId) || null;
  const committedRootId = committedType ? (committedType.parent_id ?? committedType.id) : null;
  // When the Bilty vch type is selected, the form box renders the full bilty
  // creation form instead of the normal voucher entry UI.
  const isBilty = (currentVchType?.name ?? '').toLowerCase() === 'bilty';
  // Bilty + its children (Freight Journal is already filtered out of vchTypes).
  // A primary self-references (parent_id === id), so filtering on the Bilty
  // primary's id yields "Bilty" plus every child type under it.
  const biltyPrimary = vchTypes.find((t) => t.parent_id === t.id && t.name.toLowerCase() === 'bilty') || null;
  const biltyPrimaryId = biltyPrimary?.id ?? null;
  const biltyFamily = biltyPrimaryId !== null ? vchTypes.filter((t) => t.parent_id === biltyPrimaryId) : [];
  // Derived from the picker text: exact (case-insensitive) match → that type;
  // blank or non-matching → null (no prefix, Bilty No numeric, Branch normal).
  const selectedBiltyType =
    biltyFamily.find((t) => t.name.toLowerCase() === biltyTypeText.trim().toLowerCase()) ?? null;
  const biltySubTypeId = selectedBiltyType?.id ?? null;
  // Prefix fed into the embedded bilty form. null/'' → no prefix box.
  const biltySelectedPrefix = selectedBiltyType?.prefix ?? null;
  // Branch fed into the embedded bilty form. Truthy → auto-fill + lock Branch.
  const biltySelectedBranch = selectedBiltyType?.branch ?? null;
  // Mode is driven by deemed_positive (the canonical field children INHERIT),
  // not the type name — so a custom child like "qoatation" under Receipt
  // correctly renders journal mode. null = journal (Dr/Cr ledger table),
  // YES = sales-like inventory, NO = purchase-like inventory.
  const isJournalType = currentVchType ? currentVchType.deemed_positive === null : false;
  const isPurchaseMode = currentVchType ? currentVchType.deemed_positive === 'NO' : false;

  // ── Advance / Fuel eligibility — JOURNAL only. The Mode dropdown + Bilty No
  // field (and the bilty-truck row-1 lock) render ONLY for Journal vouchers.
  // Contra / Payment / Receipt (and every other type) are left as plain
  // double-entry / inventory vouchers with no bilty mechanism.
  const currentPrimaryName = (vchTypes.find((t) => t.id === familyRootId)?.name ?? '').toLowerCase();
  // Mode (Normal/Advance/Fuel) only for plain Journal — not for Freight Journal or any other type.
  const biltyEligible = isJournalType && currentPrimaryName === 'journal' && currentVchType?.name !== 'Freight Journal';

  // Switch advance/fuel mode. Clears any in-progress bilty selection and
  // unlocks row 1 so the form returns to a clean state for the new mode.
  const selectBiltyMode = (v: 0 | 1 | 2) => {
    // User-driven mode change — resume normal advance/fuel behaviour.
    suppressBiltyHydrateRef.current = false;
    setBiltyMode(v);
    setBiltyModeMenuOpen(false);
    setBiltyNoText('');
    setSelectedBiltyId(null);
    if (biltyLockedRef.current) {
      setBiltyLocked(false);
      biltyLockedRef.current = false;
    }
    // Always reset the rows so the previous mode's row 1 doesn't carry over.
    setJournalRows((prev) => {
      const n = [...prev];
      n[0] = emptyJournalRow();
      return n;
    });
  };

  // Lazy-load the bilty list the first time advance/fuel is entered. The list
  // feeds the Bilty No search dropdown (whole bilty no, prefix included) and
  // maps a picked number back to its id for the owner lookup.
  useEffect(() => {
    if (!biltyEligible || biltyMode === 0 || biltyList.length > 0) return;
    biltyService.list()
      .then((rows) => setBiltyList(rows.map((r) => ({ id: r.id, bilty_no: r.bilty_no }))))
      .catch(() => { /* ignore — field just won't suggest */ });
  }, [biltyEligible, biltyMode, biltyList.length]);

  // React to the picked Bilty No.
  //  • Advance/Fuel: fetch the bilty's truck ledger and lock it into row 1.
  //    Fuel leaves row 2 as a normal ledger picker so the expense ledger can
  //    be selected without depending on a specific group label.
  // Clearing / changing to a non-match resets row 1 to an empty, editable row.
  useEffect(() => {
    if (!biltyEligible || biltyMode === 0) return;
    // Edit hydration restores the bilty (and its rows) programmatically — don't
    // let this effect reset/relock those rows. The selection is set directly in
    // the hydrate effect; this just stands down until the user interacts.
    if (suppressBiltyHydrateRef.current) return;
    const q = biltyNoText.trim().toLowerCase();
    const match = q ? biltyList.find((b) => b.bilty_no.toLowerCase() === q) : null;

    const resetRow1 = () => {
      setSelectedBiltyId(null);
      if (biltyLockedRef.current) { setBiltyLocked(false); biltyLockedRef.current = false; }
      setJournalRows((prev) => { const n = [...prev]; n[0] = emptyJournalRow(); return n; });
    };

    if (!match) {
      // Only unlock/reset row 1 when a bilty was actually locked or selected.
      // On an Advance/Fuel-mode EDIT, hydration restores both ledger rows while
      // the Bilty No search starts empty — an empty search must NOT be read as
      // "user cleared the bilty", or it would wipe the hydrated row 1.
      if (biltyLockedRef.current || selectedBiltyId !== null) resetRow1();
      return;
    }
    setSelectedBiltyId(match.id);

    // Advance/Fuel: lock the truck (vehicle ledger) into row 1.
    let cancelled = false;
    voucherService.biltyVehicleLedger(match.id)
      .then((res) => {
        if (cancelled) return;
        if (res.ledger_id) {
          setError(null);
          setJournalRows((prev) => {
            const n = [...prev];
            const base = n[0] ?? emptyJournalRow();
            n[0] = {
              ...base,
              drOrCr: 'Cr',
              ledger_id: res.ledger_id!,
              ledger_name: res.ledger_name ?? '',
              search: res.ledger_name ?? '',
            };
            return n;
          });
          setBiltyLocked(true);
          biltyLockedRef.current = true;
        } else {
          setBiltyLocked(false);
          biltyLockedRef.current = false;
          setError('This bilty has no truck on record.');
        }
      })
      .catch(() => { if (!cancelled) setError('Could not load the bilty truck.'); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biltyNoText, biltyMode, biltyEligible, biltyList]);

  // Restore the Bilty No text for display on edit once the bilty list loads.
  // Runs only while hydrating a restored selection — the advance/fuel effect is
  // suppressed, so setting the text here won't disturb the hydrated rows.
  useEffect(() => {
    if (!suppressBiltyHydrateRef.current || selectedBiltyId == null) return;
    if (biltyList.length === 0) return;
    const b = biltyList.find((x) => x.id === selectedBiltyId);
    if (b) setBiltyNoText(b.bilty_no);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBiltyId, biltyList]);

  // Fetch the Advance/Fuel spend cap whenever the selected bilty changes (both
  // modes share one Transport-Total pool). On edit, exclude this voucher's own
  // spend so the remaining is measured against everyone else. Cleared when no
  // bilty is selected or the mode leaves Advance/Fuel.
  useEffect(() => {
    if (!biltyEligible || biltyMode === 0 || selectedBiltyId == null) {
      setBiltyBudget(null);
      return;
    }
    let cancelled = false;
    voucherService.biltyBudget(selectedBiltyId, isEdit ? editId : null)
      .then((b) => { if (!cancelled) setBiltyBudget(b); })
      .catch(() => { if (!cancelled) setBiltyBudget(null); });
    return () => { cancelled = true; };
  }, [selectedBiltyId, biltyEligible, biltyMode, isEdit, editId]);

  // The voucher form renders its own top chrome, so the stack's navigation
  // header is unwanted. Re-assert headerShown:false whenever `isBilty` toggles —
  // the embedded Bilty wizard sets headerShown:true on unmount, which would
  // otherwise leave a stray "VoucherForm" header behind on mobile.
  useEffect(() => {
    navigation.setOptions?.({ headerShown: false });
  }, [navigation, isBilty]);

  // Editing a Bilty in-place (from a Day Book Bilty / Freight Journal row):
  // lock the rail + form to the Bilty primary type once the voucher types load,
  // so the embedded Bilty edit form renders instead of the generic voucher UI.
  useEffect(() => {
    if (biltyEditId == null || biltyPrimaryId == null) return;
    setVchTypeId(biltyPrimaryId);
    setCommittedVchTypeId(biltyPrimaryId);
  }, [biltyEditId, biltyPrimaryId]);

  // The Bilty Type picker starts BLANK — no auto-default. Until the user picks a
  // type, there's no prefix (Bilty No starts numeric) and the field is skippable.
  // The selected type is derived from the text (above), so no sync effect is
  // needed — clearing the text immediately clears the type/prefix/branch.

  // ── Load master data on mount
  useEffect(() => {
    Promise.allSettled([
      vchTypeService.list().then((all) => {
        // "Freight Journal" is internal and must not be user-selectable when creating
        // a new voucher. In edit mode we keep it in the list so currentVchType resolves
        // correctly (isJournalType, rail highlight, type label all depend on it).
        const vts = isEdit
          ? all.filter((t) => t.name !== 'Freight Invoice')
          : all.filter((t) => t.name !== 'Freight Journal' && t.name !== 'Freight Invoice');
        setVchTypes(vts);
        if (!isEdit && biltyEditId === null && vchTypeId === null) {
          // Default landing voucher type = Sales — matches the previous behaviour
          // before the layout rewrite. Skipped when editing a bilty in-place
          // (the Bilty type is selected by its own effect).
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
      setParentBiltyNo(v.parent_bilty_no || null);
      const iso = (v.vch_date || '').slice(0, 10);
      setVchDate(iso);
      setVchDateText(fmtDateDDMMYYYY(iso));
      setRemark(v.remark || '');
      const mode = v.bilty_mode === 1 || v.bilty_mode === 2 ? v.bilty_mode : 0;
      setBiltyMode(mode);
      // Restore the bilty picked in Advance/Fuel mode. Suppress the advance/fuel
      // row effect so it doesn't clobber the hydrated rows; the Bilty No text is
      // resolved for display once the bilty list loads (effect below).
      if (mode !== 0 && v.bilty_id) {
        suppressBiltyHydrateRef.current = true;
        setSelectedBiltyId(v.bilty_id);
      }
      setPartyId(v.ledger_master_id);
      setPartyName(v.party_name || '');

      const dp = v.deemed_positive;
      const isJournal = dp === null && (v.ledgerEntries.length > 0);
      const inventoryEntry = v.ledgerEntries.find((le) => (le.inventoryEntries || []).length > 0);

      if (isJournal && !inventoryEntry) {
        const hydratedRows: JournalRow[] = v.ledgerEntries.map((le) => ({
          id: uid(),
          drOrCr: Number(le.amount) >= 0 ? 'Dr' : 'Cr',
          ledger_id: le.ledger_id,
          ledger_name: le.ledger_name || '',
          amount: Math.abs(Number(le.amount)),
          search: le.ledger_name || '',
        }));
        if (mode !== 0 && v.bilty_id && hydratedRows.length > 0) {
          hydratedRows[0] = { ...hydratedRows[0], drOrCr: 'Cr' };
          setBiltyLocked(true);
          biltyLockedRef.current = true;
        }
        setJournalRows(hydratedRows);
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
    // Mobile is tap-only — no rail/arrow keyboard navigation.
    if (Platform.OS !== 'web' || isMobile) return;
    const types = vchTypes.filter((t) => t.parent_id === t.id);
    if (types.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      // While EDITING a voucher, the type must not be changed by arrows — the
      // user has to deliberately click another rail item, which then asks for
      // confirmation before discarding the loaded voucher.
      if (inEditMode) return;
      // A dropdown owns the arrow keys while it's open — the Voucher Type
      // dropdown and the Mode (Normal/Advance/Fuel) dropdown each have their
      // own capture-phase handler, so the rail must stand down while either is
      // open (otherwise arrows would swap the whole voucher type out from under
      // an open menu).
      if (typeMenuOpen || biltyModeMenuOpen) return;
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
  }, [vchTypes, vchTypeId, typeMenuOpen, biltyModeMenuOpen, isMobile, inEditMode]);

  // Web keyboard nav for the Voucher Type dropdown (the family list). Active
  // only while the menu is open. Capture phase so it wins over the rail
  // handler, and ArrowUp/Down move WITHIN the dropdown instead of the rail.
  useEffect(() => {
    if (Platform.OS !== 'web' || isMobile || !typeMenuOpen || familyTypes.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setTypeMenuHighlight((i) => (i + 1) % familyTypes.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setTypeMenuHighlight((i) => (i - 1 + familyTypes.length) % familyTypes.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const pick = familyTypes[typeMenuHighlight];
        if (pick) { setVchTypeId(pick.id); setTypeMenuOpen(false); }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setTypeMenuOpen(false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [typeMenuOpen, familyTypes, typeMenuHighlight, isMobile]);

  // When the dropdown opens, start the highlight on the current selection.
  useEffect(() => {
    if (!typeMenuOpen) return;
    const idx = familyTypes.findIndex((t) => t.id === vchTypeId);
    setTypeMenuHighlight(idx >= 0 ? idx : 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeMenuOpen]);

  // Web keyboard nav for the Mode dropdown (Normal/Advance/Fuel). Active only
  // while the menu is open. Capture phase so it wins over the rail handler —
  // ArrowUp/Down move WITHIN the dropdown, Enter commits, Escape closes.
  useEffect(() => {
    if (Platform.OS !== 'web' || isMobile || !biltyModeMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setBiltyModeHighlight((i) => (i + 1) % 3);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setBiltyModeHighlight((i) => (i - 1 + 3) % 3);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectBiltyMode(biltyModeHighlight as 0 | 1 | 2);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setBiltyModeMenuOpen(false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biltyModeMenuOpen, biltyModeHighlight, isMobile]);

  // When the Mode dropdown opens, start the highlight on the current mode.
  useEffect(() => {
    if (biltyModeMenuOpen) setBiltyModeHighlight(biltyMode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biltyModeMenuOpen]);

  // Commit a rail pick — flip the red active mark and jump cursor to the
  // first form field. Triggered on mouse click OR Enter on a focused rail
  // item (Pressable maps Enter → onPress via accessibilityRole="button").
  const selectVchType = (id: number) => {
    lastRailCommitRef.current = Date.now();
    setVchTypeId(id);
    setCommittedVchTypeId(id);
    // If the committed type is Bilty (or one of its children), land the cursor
    // on the Bilty Type picker; otherwise on the normal first form field.
    const picked = vchTypes.find((t) => t.id === id);
    const pickedRoot = picked ? (picked.parent_id ?? picked.id) : null;
    const isBiltyPick = biltyPrimaryId !== null && pickedRoot === biltyPrimaryId;
    if (isBiltyPick) {
      // Start the Bilty Type picker blank every time Bilty is chosen — no prefix
      // until the user actually picks a type.
      setBiltyTypeText('');
    }
    setTimeout(() => {
      if (isBiltyPick) biltyTypeRef.current?.focus?.();
      else firstFieldRef.current?.focus?.();
    }, 0);
  };

  // Rail-click entry point. While EDITING a voucher, switching to a different
  // voucher type would discard the loaded entry, so stage the pick and ask for
  // confirmation first. Outside edit mode it commits immediately.
  const onRailSelect = (id: number) => {
    if (inEditMode) {
      const picked = vchTypes.find((t) => t.id === id);
      const pickedRoot = picked ? (picked.parent_id ?? picked.id) : null;
      // Only guard a genuine type change — re-picking the current type is a no-op.
      if (pickedRoot !== committedRootId) {
        setPendingTypeId(id);
        return;
      }
    }
    selectVchType(id);
  };

  // Confirmed in the dialog: abandon the loaded voucher's data and switch to the
  // chosen type with a clean slate (edit mode doesn't auto-reset on type change).
  const confirmTypeChange = () => {
    const id = pendingTypeId;
    setPendingTypeId(null);
    if (id == null) return;
    resetVoucherForm();
    selectVchType(id);
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

  // Advance/Fuel cap: the journal's Dr total may not exceed the bilty's
  // remaining transport budget. Only meaningful once a bilty + budget are loaded.
  const biltyBudgetActive =
    biltyEligible && biltyMode !== 0 && selectedBiltyId !== null && biltyBudget !== null;
  // Live remaining = DB remaining (transport − already-saved spend) minus what's
  // typed into THIS voucher right now. Recomputes on every Dr keystroke.
  const biltyRemainingLive = biltyBudgetActive
    ? +(biltyBudget!.remaining - journalDr).toFixed(2)
    : 0;
  const biltyOverBudget = biltyBudgetActive && biltyRemainingLive < -0.01;

  // Auto-clear a stale validation error once the journal becomes valid again
  // (Dr = Cr and within the transport budget). Without this the "Dr must equal
  // Cr" / over-budget message lingers after the user has already fixed the rows.
  useEffect(() => {
    if (error && isJournalType && journalBalanced && !biltyOverBudget) {
      setError(null);
    }
  }, [error, isJournalType, journalBalanced, biltyOverBudget]);

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
      if (biltyOverBudget) {
        setError(`Debit ${fmt(journalDr)} exceeds the bilty's remaining transport budget of ${fmt(biltyBudget!.remaining)}.`);
        return;
      }
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
        bilty_mode: biltyEligible && biltyMode !== 0 ? biltyMode : null,
        // Persist the picked bilty so the Bilty No can be restored on edit.
        bilty_id: biltyEligible && biltyMode !== 0 ? selectedBiltyId : null,
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
        // Edits are always launched from the Day Book (the voucher list), so
        // return there explicitly (goBack() could pop past the Daybook to the
        // Dashboard) and surface a "Voucher updated" toast on arrival.
        (navigation as any).navigate('Daybook', { notice: 'Voucher updated' });
      } else {
        await voucherService.create(payload);
        // After creating a new voucher, stay on the form with a clean draft
        // so the user can keep entering vouchers of the same type. Refetch
        // the next voucher number explicitly — the vchTypeId effect won't
        // re-run because vchTypeId didn't change. Confirm with a toast.
        resetVoucherForm();
        setNotice('Voucher created');
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
  // Editing a bilty in-place: wait until the Bilty type is selected so we don't
  // flash the generic voucher UI before the embedded bilty form mounts.
  if (biltyEditId !== null && !isBilty) return <Loader />;

  // ─── Mobile Bilty: render the wizard full-height ─────────────────────────────
  // The Bilty wizard manages its own scroll + pinned bottom action bar, so it
  // must NOT live inside the page ScrollView (that collapses its flex:1 and
  // leaves dead space below the action bar). Give it a plain flex:1 host so it
  // fills the viewport and the buttons sit at the true screen bottom.
  if (isBilty && isMobile) {
    return (
      <View style={styles.shell}>
        <BiltyCreateFormEmbedded
          // Remount on Bilty-type change so the form (bilty_no, branch, etc.)
          // resets to the new type instead of carrying over stale state.
          key={`bilty-${biltyEditId ?? biltySubTypeId ?? 'none'}`}
          editingId={biltyEditId}
          prefixOverride={biltySelectedPrefix}
          branchOverride={biltySelectedBranch}
          onExit={() => {
            const fb = vchTypes.find((t) => t.parent_id === t.id && t.name.toLowerCase() !== 'bilty');
            if (fb) selectVchType(fb.id);
          }}
        />
      </View>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <View style={styles.shell}>
      <Toast message={notice} onDone={() => setNotice(null)} />
      <ScrollView
        style={styles.wrap}
        contentContainerStyle={[
          styles.content,
          isMobile && { paddingRight: spacing.md, paddingLeft: spacing.md, paddingTop: spacing.md },
          // Bilty wizard is full-bleed on mobile — drop the page gutters so the
          // embedded wizard reads as one edge-to-edge surface, not a card.
          isBilty && isMobile && { paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0 },
        ]}
      >
        <View style={[styles.formCard, isBilty && isMobile && styles.formCardBiltyMobile]}>
        {!isMobile ? (
          <View style={styles.titleRowDesktop}>
            <Text style={styles.pageTitle}>Vouchers</Text>
            {/* Bilty sub-type picker — a small searchable field beside the title.
                Lists "Bilty" + its child types; the pick drives only the prefix
                on the Bilty No field below. */}
            {isBilty ? (
              <View style={styles.biltyTypePicker}>
                <AutocompleteField
                  ref={biltyTypeRef}
                  compact
                  label="Bilty Type"
                  value={biltyTypeText}
                  options={biltyFamily.map((t) => t.name)}
                  onChangeText={setBiltyTypeText}
                  placeholder="Bilty"
                  // Skippable: Enter/Tab always jump to Bilty No — picking a type
                  // first applies its prefix, leaving it blank keeps numbering plain.
                  submitAlways
                  onSubmitNext={() => {
                    if (Platform.OS === 'web') {
                      const focusBiltyNo = (tries: number) => {
                        const el = document.querySelector('[data-guided="bilty_no"]') as HTMLElement | null;
                        if (el) { el.focus(); return; }
                        if (tries > 0) setTimeout(() => focusBiltyNo(tries - 1), 30);
                      };
                      setTimeout(() => focusBiltyNo(5), 0);
                    }
                  }}
                />
              </View>
            ) : null}
          </View>
        ) : null}

        {/* TITLE + compact primary-type selector on ONE row — the selector box
            pinned to the top-right corner (the requested "box at the corner"). */}
        {isMobile ? (
          <View style={[styles.titleRowMobile, isBilty && { paddingHorizontal: spacing.md, paddingTop: spacing.sm }]}>
            {!(isBilty && isMobile) ? <Text style={styles.pageTitle}>Vouchers</Text> : <View />}
            <View style={styles.primaryBoxWrapMobile}>
              <Pressable
                onPress={() => setPrimaryMenuOpen((v) => !v)}
                style={styles.primaryBoxMobile}
                accessibilityRole="button"
                accessibilityLabel="Switch voucher type"
              >
                <Text style={styles.primaryBoxTextMobile} numberOfLines={1}>
                  {(vchTypes.find((t) => t.id === committedRootId)?.name) ?? 'Voucher Type'}
                </Text>
                <Text style={styles.caret}>{primaryMenuOpen ? '▴' : '▾'}</Text>
              </Pressable>
              {primaryMenuOpen ? (
                <>
                  <Pressable style={styles.menuScrim} onPress={() => setPrimaryMenuOpen(false)} />
                  <View style={styles.selectMenu}>
                    {vchTypes.filter((t) => t.parent_id === t.id).map((t) => {
                      const active = t.id === committedRootId;
                      return (
                        <Pressable
                          key={t.id}
                          onPress={() => { onRailSelect(t.id); setPrimaryMenuOpen(false); }}
                          style={[styles.selectMenuItem, active && styles.selectMenuItemActive]}
                          accessibilityRole="button"
                          accessibilityLabel={`Switch to ${t.name} voucher`}
                        >
                          <Text style={[styles.selectMenuItemText, active && styles.selectMenuItemTextActive]}>{t.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}
            </View>
          </View>
        ) : null}

        {isBilty ? (
          <BiltyCreateFormEmbedded
            // Remount on Bilty-type change so the form (bilty_no, branch, etc.)
            // resets to the new type instead of carrying over stale state.
            key={`bilty-${biltyEditId ?? biltySubTypeId ?? 'none'}`}
            editingId={biltyEditId}
            prefixOverride={biltySelectedPrefix}
            branchOverride={biltySelectedBranch}
            onExit={() => {
              // Return to the normal voucher form on a non-Bilty primary instead
              // of navigating away (which previously dumped the user to Dashboard).
              const fb = vchTypes.find((t) => t.parent_id === t.id && t.name.toLowerCase() !== 'bilty');
              if (fb) selectVchType(fb.id);
            }}
          />
        ) : (
        <>
        {/* HEADER — Type dropdown · Voucher No · Voucher Date */}
        <View style={[styles.headerRow, isMobile && styles.headerRowMobile]}>
          {!isMobile ? (
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
                  {familyTypes.map((t, i) => {
                    const active = vchTypeId === t.id;
                    const hi = i === typeMenuHighlight;
                    return (
                      <Pressable
                        key={t.id}
                        onPressIn={() => { setVchTypeId(t.id); setTypeMenuOpen(false); }}
                        {...(Platform.OS === 'web' ? ({ onMouseEnter: () => setTypeMenuHighlight(i) } as any) : {})}
                        style={[styles.selectMenuItem, hi && !active && styles.selectMenuItemHover, active && styles.selectMenuItemActive]}
                      >
                        <Text style={[styles.selectMenuItemText, active && styles.selectMenuItemTextActive]}>{t.name}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
          </View>
          ) : null}

          {/* Advance / Fuel sub-mode + Bilty No — between Voucher Type and
              Voucher No, for Contra/Journal/Payment/Receipt only. Picking
              Advance/Fuel reveals the Bilty No search; selecting a bilty
              auto-fills + locks its owner into ledger row 1. */}
          {biltyEligible ? (
            <View style={[styles.field, isMobile ? styles.headerColMobile : { minWidth: 120, flexBasis: 140, flexGrow: 0 }, biltyModeMenuOpen && styles.fieldOpen]}>
              <Text style={styles.fieldLabel}>Mode</Text>
              <Pressable
                onPress={() => setBiltyModeMenuOpen((v) => !v)}
                style={styles.selectField}
                accessibilityRole="button"
                accessibilityLabel="Select advance or fuel mode"
              >
                <Text style={styles.selectText}>{biltyMode === 1 ? 'Advance' : biltyMode === 2 ? 'Fuel' : 'Normal'}</Text>
                <Text style={styles.caret}>{biltyModeMenuOpen ? '▴' : '▾'}</Text>
              </Pressable>
              {biltyModeMenuOpen ? (
                <>
                  <Pressable style={styles.menuScrim} onPress={() => setBiltyModeMenuOpen(false)} />
                  <View style={styles.selectMenu}>
                    {([{ v: 0, l: 'Normal' }, { v: 1, l: 'Advance' }, { v: 2, l: 'Fuel' }] as const).map((o) => {
                      const active = biltyMode === o.v;
                      const hi = biltyModeHighlight === o.v;
                      return (
                        <Pressable
                          key={o.v}
                          onPressIn={() => selectBiltyMode(o.v)}
                          {...(Platform.OS === 'web' ? ({ onMouseEnter: () => setBiltyModeHighlight(o.v) } as any) : {})}
                          style={[styles.selectMenuItem, hi && !active && styles.selectMenuItemHover, active && styles.selectMenuItemActive]}
                        >
                          <Text style={[styles.selectMenuItemText, active && styles.selectMenuItemTextActive]}>{o.l}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}
            </View>
          ) : null}

          {biltyEligible && biltyMode !== 0 ? (
            <View style={[styles.field, styles.headerCol, isMobile && styles.headerColMobile]}>
              <AutocompleteField
                compact
                usePortal
                label="Bilty No"
                value={biltyNoText}
                options={biltyList.map((b) => b.bilty_no)}
                onChangeText={(t) => { suppressBiltyHydrateRef.current = false; setBiltyNoText(t); }}
                placeholder="Search bilty no..."
              />
            </View>
          ) : null}

          <View style={[styles.field, styles.headerCol, isMobile && styles.headerColMobile]}>
            <Text style={styles.fieldLabel}>Voucher No</Text>
            {!isEdit && currentVchType?.prefix ? (
              // New voucher of a type that has a prefix → lock "<prefix>-" and
              // let the user edit only the number after it.
              <PrefixedNumberInput
                hideLabel
                label="Voucher No"
                prefix={currentVchType.prefix}
                value={vchNo}
                onChangeText={setVchNo}
                editable={canSave}
                placeholder="001"
                testID="vch-no-input"
              />
            ) : (
              <TextInput
                value={vchNo}
                onChangeText={setVchNo}
                placeholder="P-001"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, !canSave && styles.inputDisabled]}
                editable={canSave}
              />
            )}
          </View>

          {!isMobile ? <View style={styles.headerSpacer} /> : null}

          <View style={[styles.field, styles.headerCol, isMobile && styles.headerColMobile]}>
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

        {/* AGAINST BILTY — shown when editing a Freight Journal (parent_bilty_no is set) */}
        {parentBiltyNo ? (
          <View style={styles.againstBiltyRow}>
            <Text style={styles.againstBiltyLabel}>AGAINST BILTY</Text>
            <Text style={styles.againstBiltyValue}>{parentBiltyNo}</Text>
            <Text style={styles.againstBiltyNote}>(read-only — edit the bilty to change freight amount)</Text>
          </View>
        ) : null}

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
          <View style={[styles.tableCard, isMobile && styles.tableCardMobile]}>
            {!isMobile ? (
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { width: 36 }]}>#</Text>
                <Text style={[styles.th, { width: 70 }]}>TYPE</Text>
                <Text style={[styles.th, { flex: 1 }]}>LEDGER</Text>
                <Text style={[styles.th, styles.thRight, { width: 130 }]}>DR AMOUNT</Text>
                <Text style={[styles.th, styles.thRight, { width: 130 }]}>CR AMOUNT</Text>
                <View style={{ width: 28 }} />
              </View>
            ) : null}
            {journalRows.map((row, idx) => (
              <JournalRowEditor
                key={row.id}
                row={row}
                idx={idx}
                isMobile={isMobile}
                onChange={(patch) => setJournalRows((p) => p.map((r) => r.id === row.id ? { ...r, ...patch } : r))}
                onRemove={() => setJournalRows((p) => p.length > 2 ? p.filter((r) => r.id !== row.id) : p)}
                editable={canSave}
                locked={biltyLocked && idx === 0}
                groupFilter={biltyEligible && biltyMode === 2 && selectedBiltyId !== null && idx === 1 ? 'Pump' : undefined}
              />
            ))}
            {canSave && (
              <Pressable onPress={() => setJournalRows((p) => [...p, emptyJournalRow()])} style={styles.addLink}>
                <Text style={styles.addLinkText}>+ Add Row</Text>
              </Pressable>
            )}
            {biltyBudgetActive ? (
              <View style={styles.budgetBox}>
                <View style={styles.budgetRow}>
                  <Text style={styles.budgetLabel}>Freight Expense</Text>
                  <Text style={styles.budgetValue}>{fmt(biltyBudget!.transport_total)}</Text>
                </View>
                <View style={styles.budgetRow}>
                  <Text style={styles.budgetLabel}>Used</Text>
                  <Text style={styles.budgetValue}>{fmt(biltyBudget!.used)}</Text>
                </View>
                <View style={styles.budgetRow}>
                  <Text style={styles.budgetLabel}>Remaining</Text>
                  <Text style={[styles.budgetValue, biltyOverBudget && styles.budgetTextOver]}>{fmt(biltyRemainingLive)}</Text>
                </View>
              </View>
            ) : null}
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>Grand Total</Text>
              {isMobile ? (
                <View style={styles.grandTotalDualWrapMobile}>
                  <Text style={styles.grandTotalDualLabelMobile}>Dr {fmt(journalDr)}</Text>
                  <Text style={styles.grandTotalDualLabelMobile}>Cr {fmt(journalCr)}</Text>
                </View>
              ) : (
                <View style={styles.grandTotalDualWrap}>
                  <Text style={[styles.grandTotalValue, { width: 130 }]}>{fmt(journalDr)}</Text>
                  <Text style={[styles.grandTotalValue, { width: 130 }]}>{fmt(journalCr)}</Text>
                  <View style={{ width: 28 }} />
                </View>
              )}
            </View>
            {!journalBalanced ? (
              <Text style={styles.balanceWarn}>
                Dr and Cr must match · diff ₹{fmt(Math.abs(journalDr - journalCr))}
              </Text>
            ) : null}
            {biltyOverBudget ? (
              <Text style={styles.balanceWarn}>
                Debit ₹{fmt(journalDr)} exceeds remaining transport budget ₹{fmt(biltyBudget!.remaining)}
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={[styles.tableCard, isMobile && styles.tableCardMobile]}>
            {!isMobile ? (
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { width: 36 }]}>#</Text>
                <Text style={[styles.th, { flex: 2, minWidth: 200 }]}>ITEM</Text>
                <Text style={[styles.th, styles.thRight, { width: 80 }]}>QTY</Text>
                <Text style={[styles.th, styles.thRight, { width: 110 }]}>RATE</Text>
                <Text style={[styles.th, styles.thRight, { width: 130 }]}>AMOUNT</Text>
                <View style={{ width: 28 }} />
              </View>
            ) : null}
            {lines.map((line, idx) => (
              <ItemRowEditor
                key={line.id}
                line={line}
                idx={idx}
                items={items}
                isMobile={isMobile}
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
                  <View key={row.id} style={[styles.ledgerRow, isMobile && styles.ledgerRowMobile]}>
                    {!isMobile ? <Text style={[styles.cellMeta, { width: 36 }]}>·</Text> : null}
                    <View style={isMobile ? { width: '100%' } : { flex: 1, minWidth: 200 }}>
                      {row.auto ? (
                        <Text style={text.value}>{row.ledger_name} <Text style={text.meta}>(auto)</Text></Text>
                      ) : (
                        <LedgerPickerInline row={row} ledgers={otherLedgers} onChange={(patch) => setLedgerRows((p) => p.map((r) => r.id === row.id ? { ...r, ...patch } : r))} editable={canSave} />
                      )}
                    </View>
                    <View style={isMobile ? styles.ledgerAmountRowMobile : undefined}>
                      {isMobile ? <Text style={styles.fieldLabelSmallMobile}>Amount</Text> : null}
                      <TextInput
                        value={row.amount ? String(row.amount) : ''}
                        onChangeText={(v) => setLedgerRows((p) => p.map((r) => r.id === row.id ? { ...r, amount: Number(v) || 0 } : r))}
                        editable={!row.auto && canSave}
                        keyboardType="decimal-pad"
                        style={[styles.input, isMobile ? styles.amountInputMobile : styles.amountInput, (!row.auto && canSave) ? null : styles.inputDisabled]}
                      />
                      <Pressable onPress={() => removeLedgerRow(row.id)} disabled={row.auto || !canSave} style={[styles.removeBtn, (row.auto || !canSave) && { opacity: 0.3 }]}>
                        <Text style={styles.removeBtnText}>×</Text>
                      </Pressable>
                    </View>
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
        </>
        )}
        </View>
      </ScrollView>

      {/* RIGHT RAIL — VCH TYPES — desktop only; mobile uses the form's type dropdown. */}
      {Platform.OS === 'web' && !isMobile ? (
        <View style={styles.sideRail}>
          <Text style={styles.sideRailTitle}>VCH TYPES</Text>
          {vchTypes.filter((t) => t.parent_id === t.id).map((t, idx) => {
            // Red = the COMMITTED family's primary. Grey = arrow-preview.
            const active = t.id === committedRootId;
            const focused = railIdx === idx;
            return (
              <Pressable
                key={t.id}
                ref={(el) => { railRefs.current[idx] = el; }}
                onPress={() => onRailSelect(t.id)}
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
      {/* Confirm before switching voucher type while editing (discards data). */}
      <ConfirmDialog
        visible={pendingTypeId !== null}
        title="Change voucher type?"
        message="The voucher type can't be changed in place. If you switch it, the current voucher's information will be lost."
        confirmLabel="OK"
        cancelLabel="Cancel"
        onConfirm={confirmTypeChange}
        onCancel={() => setPendingTypeId(null)}
      />

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

function ItemRowEditor({ line, idx, items, onChange, onRemove, canRemove, onOpenBatch, editable, isMobile }: {
  line: LineItem;
  idx: number;
  items: ItemMasterItem[];
  onChange: (patch: Partial<LineItem>) => void;
  onRemove: () => void;
  canRemove: boolean;
  onOpenBatch: () => void;
  editable: boolean;
  isMobile: boolean;
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
    <View style={[styles.tableRow, open && styles.tableRowOpen, isMobile && styles.rowCardMobile]}>
      {isMobile ? (
        <View style={styles.rowCardHeadMobile}>
          <Text style={styles.rowCardIndexMobile}>Item {idx + 1}</Text>
          {editable && (
            <Pressable onPress={onRemove} disabled={!canRemove} style={[styles.removeBtn, !canRemove && { opacity: 0.3 }]}>
              <Text style={styles.removeBtnText}>×</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <Text style={[styles.cellMeta, { width: 36 }]}>{idx + 1}</Text>
      )}
      <View style={isMobile ? { width: '100%' } : { flex: 2, minWidth: 200 }}>
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
      {isMobile ? (
        <View style={styles.fieldRowMobile}>
          <View style={styles.fieldColMobile}>
            <Text style={styles.fieldLabelSmallMobile}>Qty</Text>
            <TextInput
              value={line.qty ? String(line.qty) : ''}
              onChangeText={(v) => onChange({ qty: Number(v) || 0 })}
              keyboardType="decimal-pad"
              style={[styles.input, { textAlign: 'right' }, !editable && styles.inputDisabled]}
              editable={editable}
            />
          </View>
          <View style={styles.fieldColMobile}>
            <Text style={styles.fieldLabelSmallMobile}>Rate</Text>
            <TextInput
              value={line.rate ? String(line.rate) : ''}
              onChangeText={(v) => onChange({ rate: Number(v) || 0 })}
              keyboardType="decimal-pad"
              style={[styles.input, { textAlign: 'right' }, !editable && styles.inputDisabled]}
              editable={editable}
            />
          </View>
          <View style={styles.fieldColMobile}>
            <Text style={styles.fieldLabelSmallMobile}>Amount</Text>
            <TextInput
              value={line.amount ? String(line.amount) : ''}
              editable={false}
              style={[styles.input, styles.inputDisabled, { textAlign: 'right' }]}
            />
          </View>
        </View>
      ) : (
        <>
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
        </>
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

function JournalRowEditor({ row, idx, onChange, onRemove, editable, isMobile, locked, groupFilter }: {
  row: JournalRow;
  idx: number;
  onChange: (patch: Partial<JournalRow>) => void;
  onRemove: () => void;
  editable: boolean;
  isMobile: boolean;
  // Advance flow: row 1's ledger is the bilty truck — name is fixed and not
  // searchable until the Bilty No changes/clears. Dr/Cr + amount stay open.
  locked?: boolean;
  // Fuel flow: when set, the ledger search is restricted to this ledger group
  // (e.g. 'Fuel') and the full list opens on focus (no typing required).
  groupFilter?: string;
}) {
  const [typeOpen, setTypeOpen] = useState(false);
  const [results, setResults] = useState<OtherLedger[]>([]);
  // Suppress the dropdown after the user picks an option (so tabbing back into
  // the field doesn't immediately reopen it).
  const [suppressDrop, setSuppressDrop] = useState(false);
  // Keyboard highlight index for the open dropdown.
  const [highlight, setHighlight] = useState(0);
  // Focus state — only used by group-filtered rows, which open on focus.
  const [focused, setFocused] = useState(false);

  // Debounced ledger search. Normal rows fire after 2+ chars; a group-filtered
  // row (Fuel) fetches the whole group even with an empty query.
  useEffect(() => {
    if (!groupFilter && row.search.length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      voucherService.ledgerSearch(row.search, groupFilter)
        .then(setResults)
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [row.search, groupFilter]);

  // Normal rows open ONLY while typing (2+ chars). A group-filtered row also
  // opens on focus so its restricted list shows without typing.
  const open =
    !locked &&
    !suppressDrop &&
    row.ledger_id === null &&
    (row.search.length >= 2 || (!!groupFilter && focused)) &&
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

  // Shared Dr/Cr selector block — reused in desktop inline layout and the
  // mobile card's second row.
  const drCrSelect = (
    <View style={isMobile ? styles.journalTypeColMobile : { width: 70 }}>
      {isMobile ? <Text style={styles.fieldLabelSmallMobile}>Dr / Cr</Text> : null}
      <Pressable
        onPress={() => editable && !locked && setTypeOpen((v) => !v)}
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
  );

  // Single amount input bound to the active direction — used on mobile (the
  // desktop two-column Dr/Cr amount layout collapses to one field).
  const amountInputMobile = (
    <View style={styles.journalAmountColMobile}>
      <Text style={styles.fieldLabelSmallMobile}>Amount</Text>
      <TextInput
        value={row.amount ? String(row.amount) : ''}
        onChangeText={(v) => onChange({ amount: Number(v) || 0 })}
        keyboardType="decimal-pad"
        style={[styles.input, { textAlign: 'right' }, !editable && styles.inputDisabled]}
        editable={editable}
      />
    </View>
  );

  if (isMobile) {
    return (
      <View style={[styles.tableRow, (open || typeOpen) && styles.tableRowOpen, styles.rowCardMobile]}>
        <View style={styles.rowCardHeadMobile}>
          <Text style={styles.rowCardIndexMobile}>Entry {idx + 1}</Text>
          {editable && !locked && (
            <Pressable onPress={onRemove} style={styles.removeBtn}>
              <Text style={styles.removeBtnText}>×</Text>
            </Pressable>
          )}
        </View>
        <View style={{ width: '100%' }}>
          <TextInput
            value={locked ? row.ledger_name : row.search}
            onChangeText={(v) => {
              if (locked) return;
              onChange({ search: v, ledger_id: null, ledger_name: '' });
              setSuppressDrop(false);
            }}
            onFocus={() => { setFocused(true); if (groupFilter) setSuppressDrop(false); }}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder={locked ? 'Truck (from bilty)' : groupFilter ? 'Select fuel ledger…' : 'Search ledger...'}
            placeholderTextColor={colors.textMuted}
            style={[styles.input, (row.ledger_id !== null || locked) && styles.inputBound, (!editable || locked) && styles.inputDisabled]}
            editable={editable && !locked}
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
        <View style={styles.journalSecondRowMobile}>
          {drCrSelect}
          {amountInputMobile}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.tableRow, (open || typeOpen) && styles.tableRowOpen]}>
      <Text style={[styles.cellMeta, { width: 36 }]}>{idx + 1}</Text>
      {drCrSelect}
      <View style={{ flex: 1 }}>
        <TextInput
          value={locked ? row.ledger_name : row.search}
          onChangeText={(v) => {
            if (locked) return;
            // Re-typing invalidates the previous selection and re-arms the dropdown.
            onChange({ search: v, ledger_id: null, ledger_name: '' });
            setSuppressDrop(false);
          }}
          onFocus={() => { setFocused(true); if (groupFilter) setSuppressDrop(false); }}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={locked ? 'Truck (from bilty)' : groupFilter ? 'Select fuel ledger…' : 'Search ledger...'}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, (row.ledger_id !== null || locked) && styles.inputBound, (!editable || locked) && styles.inputDisabled]}
          editable={editable && !locked}
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
      {editable && !locked && (
        <Pressable onPress={onRemove} style={styles.removeBtn}>
          <Text style={styles.removeBtnText}>×</Text>
        </Pressable>
      )}
      {locked ? <View style={{ width: 28 }} /> : null}
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

  // Bilty-on-mobile: the embedded wizard renders its own full-bleed chrome, so
  // the parent voucher card drops all of its own padding / border / background
  // to avoid the "box inside a box" nesting.
  formCardBiltyMobile: {
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    gap: 0,
    ...(Platform.OS === 'web' ? ({ boxShadow: 'none' } as any) : { shadowOpacity: 0, shadowRadius: 0 }),
  },

  pageTitle: {
    fontSize: 22,
    fontFamily: typography.uiHeavy,
    color: colors.textStrong,
    letterSpacing: 0.2,
    marginBottom: 0,
  },
  // Title + Bilty sub-type picker on one row (the picker sits beside "Vouchers").
  titleRowDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.xs,
    // The picker's dropdown must render in front of the header row below it.
    ...(Platform.OS === 'web' ? ({ position: 'relative', zIndex: 4000 } as any) : { zIndex: 4000 }),
  },
  biltyTypePicker: {
    width: 240,
    ...(Platform.OS === 'web' ? ({ position: 'relative', zIndex: 4100 } as any) : { zIndex: 4100 }),
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

  againstBiltyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 6, paddingHorizontal: 12,
    backgroundColor: '#EFF6FF', borderRadius: 6,
    borderWidth: 1, borderColor: '#BFDBFE',
    marginBottom: 8,
  },
  againstBiltyLabel: { fontSize: 11, fontFamily: typography.uiBold, color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: 0.3 },
  againstBiltyValue: { fontSize: 14, fontFamily: typography.uiBold, color: '#1E40AF' },
  againstBiltyNote: { fontSize: 12, fontFamily: typography.ui, color: '#60A5FA' },

  // ── Mobile layout overrides (all gated by isMobile in the JSX) ──────────────
  headerRowMobile: {
    // Voucher No + Date sit side-by-side (Voucher Type is hidden on mobile —
    // the top-right box selects it). Keeps the header compact with no tall gap.
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: 0,
    marginBottom: spacing.sm,
  },
  headerColMobile: {
    flexBasis: '48%',
    minWidth: 0,
    width: '48%',
    maxWidth: '48%',
  },
  titleRowMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    // Sit ABOVE the headerRow (zIndex 1000) so the primary-type dropdown that
    // drops from the top-right box renders IN FRONT of the Voucher No/Date row.
    ...(Platform.OS === 'web' ? ({ position: 'relative', zIndex: 3000 } as any) : { zIndex: 3000 }),
  },
  // Compact primary-type box — mobile replacement for the desktop VCH TYPES
  // rail. A small pill pinned to the top-right that opens a dropdown of the
  // primary voucher types.
  primaryBoxRowMobile: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: -spacing.xs,
    marginBottom: spacing.xs,
  },
  primaryBoxWrapMobile: {
    width: 168,
    ...(Platform.OS === 'web' ? ({ position: 'relative', zIndex: 1100 } as any) : { zIndex: 1100 }),
  },
  primaryBoxMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brandRed,
    backgroundColor: colors.brandRedTone,
  },
  primaryBoxTextMobile: {
    flexShrink: 1,
    fontSize: 13,
    fontFamily: typography.uiBold,
    color: colors.brandRed,
  },
  // Table card loses its border on mobile — rows render as standalone cards.
  tableCardMobile: {
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  // Each ledger / item row becomes a vertical card on mobile.
  rowCardMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowCardHeadMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowCardIndexMobile: {
    fontSize: 12,
    fontFamily: typography.uiBold,
    color: colors.textMuted,
    letterSpacing: 0.4,
  },
  fieldLabelSmallMobile: {
    fontSize: 11,
    fontFamily: typography.uiMedium,
    color: colors.textMuted,
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  // qty / rate / amount three-up row inside a mobile item card.
  fieldRowMobile: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  fieldColMobile: {
    flex: 1,
    minWidth: 0,
  },
  // Journal card second row: Dr/Cr selector + amount side by side.
  journalSecondRowMobile: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
    alignItems: 'flex-end',
  },
  journalTypeColMobile: {
    width: 110,
    flexShrink: 0,
  },
  journalAmountColMobile: {
    flex: 1,
    minWidth: 0,
  },
  // Inline (auto-tax / manual) ledger row → card on mobile.
  ledgerRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  ledgerAmountRowMobile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    width: '100%',
  },
  amountInputMobile: {
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
  },
  grandTotalDualWrapMobile: {
    alignItems: 'flex-end',
  },
  grandTotalDualLabelMobile: {
    fontSize: 14,
    fontFamily: typography.uiHeavy,
    color: '#2563EB',
    textAlign: 'right',
  },

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
  selectMenuItemHover: { backgroundColor: '#F1F5F9' },
  selectMenuItemText: { fontSize: 13, fontFamily: typography.uiMedium, color: colors.textMuted },
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

  budgetBox: {
    paddingHorizontal: spacing.md,
    paddingTop: 4,
  },
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  budgetLabel: { color: colors.textMuted, fontSize: 13, lineHeight: 18, fontFamily: typography.ui },
  budgetValue: { color: colors.text, fontSize: 14, lineHeight: 19, fontFamily: typography.mono },
  budgetTextOver: {
    color: colors.danger,
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
