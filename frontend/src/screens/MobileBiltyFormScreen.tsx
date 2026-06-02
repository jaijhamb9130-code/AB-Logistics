/**
 * MobileBiltyFormScreen — 2-step wizard + preview for creating/editing a bilty
 * on mobile-web (<768px). Desktop continues to use the single-page BiltyFormScreen.
 *
 * Steps:
 *   1. Bilty Details   (consignor, branch, truck, GST, etc.)
 *   2. Items           (dynamic field array)
 *   3. Preview         (read-only summary; "Save Bilty" persists)
 *
 * State lives in a single React Hook Form so going Previous → Next preserves
 * everything inside the current session. Refresh / navigating away discards.
 */

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ButtonPrimary } from '../components/ButtonPrimary';
import { InputField } from '../components/InputField';
import { PrefixedNumberInput } from '../components/PrefixedNumberInput';
import { Loader } from '../components/Loader';
import { AutocompleteField } from '../components/AutocompleteField';
import { Modal } from '../components/Modal';
import { ledgerMasterService } from '../services/ledgerMasterService';
import { ledgerGroupService } from '../services/ledgerGroupService';
import { itemMasterService } from '../services/itemMasterService';
import { vehicleMasterService } from '../services/vehicleMasterService';
import { destinationService } from '../services/destinationService';
import { ownerService } from '../services/ownerService';
import { zoneService } from '../services/zoneService';
import { colors, radius, spacing, typography } from '../constants/theme';
import { useBiltyCreate, useBiltyUpdate } from '../hooks/useBiltyUpdate';
import { biltyService } from '../services/biltyService';
import { vchTypeService } from '../services/vchTypeService';
import { CreateBiltySchema } from '../../../shared/schemas/bilty.schema';
import type { CreateBiltyInput } from '../../../shared/schemas/bilty.schema';
import { itemsTotal, netPayable, toNum } from '../utils/biltyValidation';
import { getTodayISO } from '../utils/dateUtils';

interface Props {
  editingId: number | null;
  onClose: () => void;
  onSaved: (id?: number) => void;
  canSave: boolean;
}

const EMPTY_HEADER: CreateBiltyInput['header'] = {
  bilty_no: '',
  bilty_date: getTodayISO(),
  consignor: '',
  bill_to: '',
  owner_name: '',
  agent_name: '',
  branch: '',
  zone_name: '',
  truck_no: '',
  goods_type: '',
};

export const EMPTY_ITEM: CreateBiltyInput['items'][number] = {
  challan_no: '', lr_no: '', from_loc: '', to_loc: '', consignee: '',
  qty: 0, rate: 0, inc_rate: 0, l_rate: 0, e_rate: 0,
  shipment_no: '',
};

function toNumStr(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function toDateStr(v: unknown): string {
  if (!v) return '';
  return String(v).slice(0, 10);
}

// Pull the first human-readable message out of a react-hook-form errors tree
// (header fields first, then per-item fields) so a failed Save can tell the
// user exactly what to fix.
function firstBiltyErrorMessage(errs: any): string {
  const firstOf = (obj: any): string | null => {
    if (!obj) return null;
    for (const val of Object.values(obj)) {
      if (val && typeof (val as any).message === 'string') return (val as any).message;
    }
    return null;
  };
  const headerMsg = firstOf(errs?.header);
  if (headerMsg) return headerMsg;
  if (errs?.items) {
    if (typeof errs.items.message === 'string') return errs.items.message;
    if (Array.isArray(errs.items)) {
      for (const it of errs.items) {
        const m = firstOf(it);
        if (m) return `Item: ${m}`;
      }
    }
  }
  return 'Please complete the required fields before saving.';
}

const filterDecimal = (raw: string): string => {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  return parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned;
};
const filterLetters = (v: string) => v.replace(/[^a-zA-Z\s'.\-]/g, '');
const filterAlphanumeric = (v: string) => v.replace(/[^a-zA-Z0-9\s\-_./]/g, '');
const filterDate = (v: string) => v.replace(/[^0-9\-]/g, '').slice(0, 10);

type StepNum = 1 | 2 | 3;

export function MobileBiltyFormScreen({ editingId, onClose, onSaved, canSave }: Props) {
  const navigation = useNavigation();
  const isEdit = editingId != null;
  const { mutateAsync: createBilty, isPending: creating } = useBiltyCreate();
  const { mutateAsync: updateBilty, isPending: updating } = useBiltyUpdate(editingId ?? 0);
  const saving = creating || updating;

  const [step, setStep] = useState<StepNum>(1);
  const [loading, setLoading] = useState<boolean>(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gstNo, setGstNo] = useState<string>('');
  // Surfaced when Save is pressed but the form fails validation — without this
  // the (otherwise silent) Zod failure made the button look broken.
  const [saveError, setSaveError] = useState<string | null>(null);
  // The Bilty voucher type's own prefix (e.g. "blt") — locks the Bilty No lead.
  const [biltyPrefix, setBiltyPrefix] = useState<string | null>(null);
  useEffect(() => {
    vchTypeService.list()
      .then((types) => setBiltyPrefix(types.find((t) => t.name === 'Bilty')?.prefix ?? null))
      .catch(() => { /* ignore — falls back to plain numbering */ });
  }, []);

  // Hide the React Navigation header — the wizard renders its own top bar.
  useEffect(() => {
    navigation.setOptions?.({ headerShown: false });
    return () => {
      navigation.setOptions?.({ headerShown: true });
    };
  }, [navigation]);

  // Master data
  const [partyOptions, setPartyOptions] = useState<string[]>([]);
  const [agentOptions, setAgentOptions] = useState<string[]>([]);
  const [itemOptions, setItemOptions] = useState<string[]>([]);
  const [vehicleNoOptions, setVehicleNoOptions] = useState<string[]>([]);
  const [branchOptions, setBranchOptions] = useState<string[]>([]);
  const [destinationOptions, setDestinationOptions] = useState<string[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<string[]>([]);
  const [zoneOptions, setZoneOptions] = useState<string[]>([]);

  useEffect(() => {
    Promise.allSettled([
      // Pull all ledgers for the consignor / bill-to picker; resolve the
      // "Agent" group by name to derive agent options. Avoids hardcoded ids.
      Promise.all([
        ledgerGroupService.list(),
        ledgerMasterService.list(null),
      ]).then(([groups, ledgers]) => {
        setPartyOptions(ledgers.map((r) => r.name).sort());
        const agentGroupId =
          groups.find((g) => g.group_name.toLowerCase() === 'agent')?.id ?? null;
        const agents = agentGroupId != null
          ? ledgers.filter((r) => r.ledger_group_id === agentGroupId)
          : [];
        setAgentOptions(agents.map((r) => r.name).sort());
      }),
      itemMasterService.list().then((rs) => setItemOptions(rs.map((r) => r.name).sort())),
      vehicleMasterService.list().then((rs) =>
        setVehicleNoOptions(rs.map((r) => r.name).sort())
      ),
      destinationService.listBranches().then(setBranchOptions),
      destinationService.list().then((rs) =>
        setDestinationOptions(
          [...new Set(rs.map((r) => r.name).filter((v): v is string => Boolean(v)))].sort()
        )
      ),
      ownerService.list().then((rs) => setOwnerOptions(rs.map((r) => r.name).sort())),
      zoneService.list().then((rs) => setZoneOptions(rs.map((r) => r.name).sort())),
    ]);
  }, []);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<CreateBiltyInput>({
    resolver: zodResolver(CreateBiltySchema),
    defaultValues: {
      header: EMPTY_HEADER,
      items: [],
    },
  });

  // Echo the current bilty_no into the top-bar title when editing.
  const headerBiltyNo = useWatch({ control, name: 'header.bilty_no' });

  // Load existing bilty
  useEffect(() => {
    if (!isEdit || editingId == null) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const detail = await biltyService.get(editingId);
        if (cancelled) return;
        reset({
          header: {
            bilty_no: detail.bilty_no ?? '',
            bilty_date: toDateStr(detail.bilty_date) || getTodayISO(),
            consignor: detail.consignor ?? '',
            bill_to: detail.bill_to ?? '',
            owner_name: detail.owner_name ?? '',
            agent_name: detail.agent_name ?? '',
            branch: detail.branch ?? '',
            zone_name: detail.zone_name ?? '',
            truck_no: detail.truck_no ?? '',
            goods_type: detail.goods_type ?? '',
          },
          items: (detail.items ?? []).map((it) => ({
            challan_no: it.challan_no ?? '',
            lr_no: it.lr_no ?? '',
            from_loc: it.from_loc ?? '',
            to_loc: it.to_loc ?? '',
            consignee: it.consignee ?? '',
            qty: toNumStr(it.qty),
            rate: toNumStr(it.rate),
            inc_rate: toNumStr(it.inc_rate),
            l_rate: toNumStr(it.l_rate),
            e_rate: toNumStr(it.e_rate),
            shipment_no: it.shipment_no ?? '',
          })),
        });
      } catch {
        if (!cancelled) setLoadError('Could not load bilty. Try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isEdit, editingId, reset]);

  const itemArr = useFieldArray({ control, name: 'items' });

  const watchedItems = useWatch({ control, name: 'items' });
  const watchedHeader = useWatch({ control, name: 'header' });

  const goNext = () => { setSaveError(null); setStep((s) => (Math.min(3, s + 1) as StepNum)); };
  const goPrev = () => { setSaveError(null); setStep((s) => (Math.max(1, s - 1) as StepNum)); };

  const onValidSave = async (data: CreateBiltyInput) => {
    setSaveError(null);
    // Mobile-only: bilty_no is manual entry and required. The shared schema
    // keeps it optional for desktop compatibility, so we enforce here.
    const biltyNoInput = (data.header?.bilty_no || '').trim();
    if (!biltyNoInput) {
      setError('header.bilty_no' as any, { message: 'Bilty No is required' });
      setSaveError('Bilty No is required.');
      setStep(1);
      return;
    }
    // The backend requires a Goods Type once the bilty has items (it anchors
    // the inventory entry). Catch it here so the user gets instant feedback on
    // Step 1 instead of a round-trip 400.
    if ((data.items?.length ?? 0) > 0 && !(data.header?.goods_type || '').trim()) {
      setError('header.goods_type' as any, { message: 'Goods Type is required' });
      setSaveError('Goods Type is required when the bilty has items.');
      setStep(1);
      return;
    }
    try {
      if (isEdit && editingId !== null) {
        await updateBilty(data);
        onSaved(editingId);
      } else {
        await createBilty(data);
        onSaved();
      }
    } catch (err: any) {
      const apiErr = err?.response?.data?.error;
      if (apiErr?.fields) {
        const fieldKeys = Object.keys(apiErr.fields);
        fieldKeys.forEach((field) => {
          setError(field as Parameters<typeof setError>[0], { message: apiErr.fields[field] as string });
        });
        // Jump to whichever step owns the offending field so the user sees the
        // inline error (header fields → Step 1, item fields → Step 2).
        if (fieldKeys.some((f) => f.startsWith('header.'))) setStep(1);
        else if (fieldKeys.some((f) => f.startsWith('items'))) setStep(2);
      }
      setSaveError(apiErr?.message || 'Could not save bilty. Please try again.');
    }
  };

  // Validation failed (Zod) — react-hook-form's handleSubmit skips onValidSave
  // entirely. Surface a readable reason and jump to the step that owns the
  // first bad field so the user isn't staring at a dead button.
  const onInvalidSave = (formErrors: any) => {
    setSaveError(firstBiltyErrorMessage(formErrors));
    if (formErrors?.header) setStep(1);
    else if (formErrors?.items) setStep(2);
  };

  const onSave = handleSubmit(onValidSave, onInvalidSave);

  if (isEdit && loading) {
    return (
      <View style={[styles.shell, styles.center]}>
        <Loader />
      </View>
    );
  }
  if (isEdit && loadError) {
    return (
      <View style={[styles.shell, styles.center]}>
        <Text style={styles.errText}>{loadError}</Text>
        <Pressable onPress={onClose} style={styles.btnGhost}>
          <Text style={styles.btnGhostText}>Close</Text>
        </Pressable>
      </View>
    );
  }

  const stepTitles: Record<StepNum, string> = {
    1: 'Bilty Details',
    2: 'Items',
    3: 'Preview',
  };

  return (
    <View style={styles.shell}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn} accessibilityLabel="Close">
          <Text style={styles.closeBtnText}>×</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.topTitle}>
            {isEdit ? 'Edit Bilty' : 'New Bilty'}
            {isEdit && headerBiltyNo && headerBiltyNo.trim() ? ` / ${headerBiltyNo.trim()}` : ''}
          </Text>
          <Text style={styles.topSubtitle}>
            {step < 3 ? `Step ${step} of 2 · ${stepTitles[step]}` : 'Preview'}
          </Text>
        </View>
        {/* Date — top-right corner */}
        <Controller
          control={control}
          name="header.bilty_date"
          render={({ field: { value, onChange } }) => (
            <View style={styles.topDateWrap}>
              <Text style={styles.topDateLabel}>DATE</Text>
              {Platform.OS === 'web' ? (
                React.createElement('input', {
                  type: 'date',
                  value: value ?? '',
                  onChange: (e: any) => onChange(e?.target?.value || ''),
                  style: topDateInputStyle,
                })
              ) : (
                <Text style={styles.topDateValue}>{value || '—'}</Text>
              )}
            </View>
          )}
        />
      </View>

      {/* Step content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 ? (
          <Step1Details
            control={control}
            errors={errors}
            consignorOptions={partyOptions}
            agentOptions={agentOptions}
            itemOptions={itemOptions}
            vehicleNoOptions={vehicleNoOptions}
            branchOptions={branchOptions}
            gstNo={gstNo}
            setGstNo={setGstNo}
            biltyPrefix={isEdit ? null : biltyPrefix}
            getValues={getValues}
            onLastField={() => goNext()}
            ownerOptions={ownerOptions}
            zoneOptions={zoneOptions}
          />
        ) : null}

        {step === 2 ? (
          <Step2Items
            control={control}
            errors={errors}
            itemArr={itemArr}
            getValues={getValues}
            setValue={setValue}
            consignorOptions={partyOptions}
            destinationOptions={destinationOptions}
          />
        ) : null}

        {step === 3 ? (
          <PreviewView
            header={watchedHeader as CreateBiltyInput['header']}
            items={(watchedItems ?? []) as CreateBiltyInput['items']}
            gstNo={gstNo}
          />
        ) : null}
      </ScrollView>

      {/* Save validation / API error — shown just above the action bar */}
      {saveError ? (
        <View style={styles.saveErrorBar}>
          <Text style={styles.saveErrorText}>{saveError}</Text>
        </View>
      ) : null}

      {/* Bottom action bar — different button set per step */}
      <View style={styles.bottomBar}>
        {step === 1 ? (
          <View style={{ flex: 1 }}>
            <ButtonPrimary title="Next Step  →" onPress={() => goNext()} />
          </View>
        ) : null}
        {step === 2 ? (
          <>
            <Pressable onPress={goPrev} style={styles.btnGhost} accessibilityRole="button">
              <Text style={styles.btnGhostText}>← Previous</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <ButtonPrimary title="Preview  →" onPress={() => goNext()} />
            </View>
          </>
        ) : null}
        {step === 3 ? (
          <>
            <Pressable onPress={goPrev} style={styles.btnGhost} accessibilityRole="button">
              <Text style={styles.btnGhostText}>← Previous</Text>
            </Pressable>
            {isEdit ? (
              <Pressable onPress={onClose} style={styles.btnDanger} accessibilityRole="button">
                <Text style={styles.btnDangerText}>Cancel</Text>
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }}>
              {canSave ? (
                <ButtonPrimary title="Save Bilty" onPress={onSave} loading={saving} />
              ) : (
                <Text style={{ color: colors.danger, fontFamily: typography.uiBold, textAlign: 'center' }}>
                  No permission to {isEdit ? 'edit' : 'create'}
                </Text>
              )}
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

// ─── Step 1: Header / details ─────────────────────────────────────────────────
function Step1Details({
  control,
  errors,
  consignorOptions,
  agentOptions,
  itemOptions,
  vehicleNoOptions,
  branchOptions,
  gstNo,
  setGstNo,
  biltyPrefix,
  getValues,
  onLastField,
  ownerOptions,
  zoneOptions,
}: {
  control: any;
  errors: any;
  consignorOptions: string[];
  agentOptions: string[];
  itemOptions: string[];
  vehicleNoOptions: string[];
  branchOptions: string[];
  gstNo: string;
  setGstNo: (v: string) => void;
  biltyPrefix: string | null;
  getValues: any;
  onLastField?: () => void;
  ownerOptions: string[];
  zoneOptions: string[];
}) {
  // Guided entry (mobile-web): Enter/Tab walks field-by-field, each gated.
  // Dropdowns force a listed pick; free-text (Bilty No / Zone / GST / Owner)
  // require non-empty. After the last field, advance to the next wizard step.
  const MOB_ORDER = ['bilty_no', 'branch', 'consignor', 'bill_to', 'truck_no', 'goods_type', 'zone', 'gst', 'owner_name', 'agent_name'];
  const mobRefs = useRef<Record<string, { focus: () => void } | null>>({});
  const setMobRef = (k: string) => (r: { focus: () => void } | null) => { mobRefs.current[k] = r; };
  const onLastFieldRef = useRef(onLastField);
  onLastFieldRef.current = onLastField;
  const focusMobNext = (k: string) => {
    const i = MOB_ORDER.indexOf(k);
    for (let n = i + 1; n < MOB_ORDER.length; n++) {
      const r = mobRefs.current[MOB_ORDER[n]];
      if (r && typeof r.focus === 'function') { r.focus(); return; }
    }
    onLastFieldRef.current?.(); // past last field → next wizard step
  };
  const mobTextNext = (k: string, raw: unknown) => {
    if (String(raw ?? '').trim() !== '') focusMobNext(k);
  };

  // Tab gating for the plain-input fields (Bilty No / Zone / GST / Owner) —
  // identify by data-guided and block Tab unless non-empty. Autocomplete fields
  // gate Tab themselves.
  const gstRef = useRef(gstNo);
  gstRef.current = gstNo;
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.shiftKey) return;
      const el = document.activeElement as HTMLElement | null;
      const key = el?.dataset?.guided;
      if (!key) return;
      const valOf: Record<string, () => string> = {
        bilty_no: () => String(getValues('header.bilty_no') ?? ''),
        gst: () => gstRef.current,
      };
      if (!valOf[key]) return;
      e.preventDefault();
      if (valOf[key]().trim() !== '') focusMobNext(key);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [getValues]);

  return (
    <View style={styles.sectionTight}>
      <SectionBar title="BILTY DETAILS" />
      <View style={styles.detailsBody}>
        {/* Row 1 — Bilty No · Branch */}
        <View style={[styles.fieldRow, styles.zRow8]}>
          <View style={styles.fieldCol}>
            <Controller
              control={control}
              name="header.bilty_no"
              render={({ field: { value, onChange } }) => (
                <PrefixedNumberInput
                  ref={setMobRef('bilty_no')}
                  compact
                  label="Bilty No *"
                  prefix={biltyPrefix}
                  value={value ?? ''}
                  onChangeText={onChange}
                  placeholder="e.g. 18521"
                  error={errors.header?.bilty_no?.message ?? null}
                  blurOnSubmit={false}
                  onSubmitEditing={() => mobTextNext('bilty_no', getValues('header.bilty_no'))}
                  dataSet={{ guided: 'bilty_no' }}
                />
              )}
            />
          </View>
          <View style={styles.fieldCol}>
            <Controller
              control={control}
              name="header.branch"
              render={({ field: { value, onChange } }) => (
                <AutocompleteField ref={setMobRef('branch')} compact label="Branch" value={value ?? ''} options={branchOptions} onChangeText={onChange} placeholder="" onSubmitNext={() => focusMobNext('branch')} />
              )}
            />
          </View>
        </View>

        {/* Row 2 — Consignor */}
        <View style={[styles.fieldRow, styles.zRow7]}>
          <View style={styles.fieldCol}>
            <Controller
              control={control}
              name="header.consignor"
              render={({ field: { value, onChange } }) => (
                <AutocompleteField
                  ref={setMobRef('consignor')}
                  compact
                  label="Consignor *"
                  value={value}
                  options={consignorOptions}
                  onChangeText={onChange}
                  placeholder=""
                  error={errors.header?.consignor?.message ?? null}
                  onSubmitNext={() => focusMobNext('consignor')}
                />
              )}
            />
          </View>
        </View>

        {/* Row 3 — Bill To (same source as Consignor — ledger_master) */}
        <View style={[styles.fieldRow, styles.zRow6]}>
          <View style={styles.fieldCol}>
            <Controller
              control={control}
              name="header.bill_to"
              render={({ field: { value, onChange } }) => (
                <AutocompleteField
                  ref={setMobRef('bill_to')}
                  compact
                  label="Bill To"
                  value={value ?? ''}
                  options={consignorOptions}
                  onChangeText={onChange}
                  placeholder=""
                  onSubmitNext={() => focusMobNext('bill_to')}
                />
              )}
            />
          </View>
        </View>

        {/* Row 4 — Truck No · Goods Type */}
        <View style={[styles.fieldRow, styles.zRow5]}>
          <View style={styles.fieldCol}>
            <Controller
              control={control}
              name="header.truck_no"
              render={({ field: { value, onChange } }) => (
                <AutocompleteField
                  ref={setMobRef('truck_no')}
                  compact
                  label="Truck No *"
                  value={value ?? ''}
                  options={vehicleNoOptions}
                  onChangeText={(v) => onChange(v.toUpperCase())}
                  error={errors.header?.truck_no?.message ?? null}
                  placeholder=""
                  onSubmitNext={() => focusMobNext('truck_no')}
                />
              )}
            />
          </View>
          <View style={styles.fieldCol}>
            <Controller
              control={control}
              name="header.goods_type"
              render={({ field: { value, onChange } }) => (
                <AutocompleteField
                  ref={setMobRef('goods_type')}
                  compact
                  label="Goods Type *"
                  value={value ?? ''}
                  options={itemOptions}
                  onChangeText={onChange}
                  placeholder=""
                  error={errors.header?.goods_type?.message ?? null}
                  onSubmitNext={() => focusMobNext('goods_type')}
                />
              )}
            />
          </View>
        </View>

        {/* Row 5 — Zone */}
        <View style={[styles.fieldRow, styles.zRow4]}>
          <View style={styles.fieldCol}>
            <Controller
              control={control}
              name="header.zone_name"
              render={({ field: { value, onChange } }) => (
                <AutocompleteField ref={setMobRef('zone')} compact label="Zone" value={value ?? ''} options={zoneOptions} onChangeText={onChange} placeholder="" onSubmitNext={() => focusMobNext('zone')} />
              )}
            />
          </View>
        </View>

        {/* Row 6 — GST No */}
        <View style={[styles.fieldRow, styles.zRow3]}>
          <View style={styles.fieldCol}>
            <InputField
              ref={setMobRef('gst')}
              compact
              label="GST No"
              value={gstNo}
              onChangeText={(v) => setGstNo(v.toUpperCase())}
              fieldType="alphanumeric"
              autoCapitalize="characters"
              placeholder="22AAAAA0000A1Z5"
              blurOnSubmit={false}
              onSubmitEditing={() => mobTextNext('gst', gstNo)}
              dataSet={{ guided: 'gst' }}
            />
          </View>
        </View>

        {/* Row 7 — Owner Name */}
        <View style={[styles.fieldRow, styles.zRow2]}>
          <View style={styles.fieldCol}>
            <Controller
              control={control}
              name="header.owner_name"
              render={({ field: { value, onChange } }) => (
                <AutocompleteField ref={setMobRef('owner_name')} compact label="Owner Name" value={value ?? ''} options={ownerOptions} onChangeText={onChange} placeholder="" onSubmitNext={() => focusMobNext('owner_name')} />
              )}
            />
          </View>
        </View>

        {/* Row 8 — Agent Name */}
        <View style={[styles.fieldRow, styles.zRow1]}>
          <View style={styles.fieldCol}>
            <Controller
              control={control}
              name="header.agent_name"
              render={({ field: { value, onChange } }) => (
                <AutocompleteField ref={setMobRef('agent_name')} compact label="Agent Name" value={value ?? ''} options={agentOptions} onChangeText={onChange} placeholder="" onSubmitNext={() => focusMobNext('agent_name')} />
              )}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Step 2: Items ────────────────────────────────────────────────────────────
// Cards on the page show a 5-field summary (Challan, LR, From, To, Consignee).
// Tapping a card opens a read-only Preview modal with Edit / OK buttons.
// "+ Add Item" or the preview's Edit button opens the editable modal where the
// full field set can be filled in. Save closes the editable modal and updates
// the card; Cancel discards changes (or removes the just-added item if new).
export function Step2Items({
  control,
  errors,
  itemArr,
  getValues,
  setValue,
  consignorOptions = [],
  destinationOptions = [],
}: {
  control: any;
  errors: any;
  itemArr: any;
  getValues: any;
  setValue: any;
  consignorOptions?: string[];
  destinationOptions?: string[];
}) {
  const { fields, append, remove } = itemArr;
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<'preview' | 'edit'>('preview');
  const [snapshot, setSnapshot] = useState<any>(null);
  const [isNew, setIsNew] = useState(false);

  const openAdd = () => {
    const newIndex = fields.length;
    append({ ...EMPTY_ITEM });
    setIsNew(true);
    setSnapshot(null);
    setMode('edit');
    setModalIndex(newIndex);
  };

  const openPreview = (i: number) => {
    setIsNew(false);
    setSnapshot(null);
    setMode('preview');
    setModalIndex(i);
  };

  const switchToEdit = () => {
    if (modalIndex !== null) {
      setSnapshot(getValues(`items.${modalIndex}`));
      setMode('edit');
    }
  };

  const closePreview = () => {
    setModalIndex(null);
    setSnapshot(null);
    setIsNew(false);
    setMode('preview');
  };

  const handleSave = () => {
    // Drop newly-added items that the user saved without filling anything.
    if (isNew && modalIndex !== null) {
      const cur = getValues(`items.${modalIndex}`) ?? {};
      const isBlank = (v: unknown) =>
        v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
      const isZero = (v: unknown) => v === 0 || v === '0' || v === '';
      const empty =
        isBlank(cur.challan_no) &&
        isBlank(cur.lr_no) &&
        isBlank(cur.from_loc) &&
        isBlank(cur.to_loc) &&
        isBlank(cur.consignee) &&
        isZero(cur.qty) &&
        isZero(cur.rate) &&
        isZero(cur.inc_rate) &&
        isZero(cur.l_rate) &&
        isZero(cur.e_rate);
      if (empty) {
        remove(modalIndex);
      }
    }
    setModalIndex(null);
    setSnapshot(null);
    setIsNew(false);
    setMode('preview');
  };

  const handleCancel = () => {
    if (isNew && modalIndex !== null) {
      remove(modalIndex);
    } else if (snapshot && modalIndex !== null) {
      setValue(`items.${modalIndex}`, snapshot, { shouldDirty: true });
    }
    setModalIndex(null);
    setSnapshot(null);
    setIsNew(false);
    setMode('preview');
  };

  const onModalClose = () => {
    if (mode === 'edit') handleCancel();
    else closePreview();
  };

  const modalTitle =
    mode === 'preview'
      ? `Item ${(modalIndex ?? 0) + 1}`
      : isNew
      ? 'New Item'
      : `Edit Item ${(modalIndex ?? 0) + 1}`;

  return (
    <View style={styles.sectionTight}>
      <SectionBar title="ITEMS" actionLabel="+ Add Item" onAction={openAdd} />
      {errors.items?.message ? (
        <Text style={[styles.errText, { paddingHorizontal: 8 }]}>{errors.items.message}</Text>
      ) : null}
      <View style={styles.itemsList}>
        {fields.length === 0 ? (
          <Text style={[styles.muted, { paddingHorizontal: 8 }]}>No items yet — tap "+ Add Item".</Text>
        ) : null}
        {fields.map((field: any, i: number) => (
          <ItemSummaryCard
            key={field.id}
            index={i}
            control={control}
            onPress={() => openPreview(i)}
            onRemove={() => remove(i)}
          />
        ))}
      </View>

      <Modal
        visible={modalIndex !== null}
        onClose={onModalClose}
        title={modalTitle}
        centered
      >
        {modalIndex !== null ? (
          mode === 'preview' ? (
            <ItemPreview
              control={control}
              index={modalIndex}
              onEdit={switchToEdit}
              onOk={closePreview}
            />
          ) : (
            <ItemFormFields
              control={control}
              errors={errors}
              index={modalIndex}
              onSave={handleSave}
              onCancel={handleCancel}
              consignorOptions={consignorOptions}
              destinationOptions={destinationOptions}
              getValues={getValues}
            />
          )
        ) : null}
      </Modal>
    </View>
  );
}

// ─── Item preview (read-only modal body, shown on card tap) ─────────────────
function ItemPreview({
  control,
  index,
  onEdit,
  onOk,
}: {
  control: any;
  index: number;
  onEdit: () => void;
  onOk: () => void;
}) {
  const item = (useWatch({ control, name: `items.${index}` }) as any) ?? {};
  return (
    <View>
      <View style={styles.summaryRow}>
        <SummaryCell label="CHALLAN NO" value={item.challan_no} />
        <SummaryCell label="LR NO" value={item.lr_no} />
      </View>
      <View style={styles.summaryRow}>
        <SummaryCell label="FROM" value={item.from_loc} />
        <SummaryCell label="TO" value={item.to_loc} />
      </View>
      <SummaryCell label="CONSIGNEE" value={item.consignee} />
      <View style={styles.summaryRow}>
        <SummaryCell label="QTY" value={item.qty} />
        <SummaryCell label="RATE" value={item.rate} />
        <SummaryCell label="INC" value={item.inc_rate} />
      </View>
      <View style={styles.summaryRow}>
        <SummaryCell label="L-RATE" value={item.l_rate} />
        <SummaryCell label="E-RATE" value={item.e_rate} />
        <SummaryCell label="SHIPMENT NO" value={item.shipment_no} />
      </View>

      <View style={styles.modalActions}>
        <Pressable onPress={onEdit} style={[styles.modalBtn, styles.modalBtnCancel]} accessibilityRole="button">
          <Text style={styles.modalBtnCancelText}>Edit</Text>
        </Pressable>
        <Pressable onPress={onOk} style={[styles.modalBtn, styles.modalBtnSave]} accessibilityRole="button">
          <Text style={styles.modalBtnSaveText}>OK</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Item summary card (5-field preview, opens modal on press) ───────────────
function ItemSummaryCard({
  index,
  control,
  onPress,
  onRemove,
}: {
  index: number;
  control: any;
  onPress: () => void;
  onRemove: () => void;
}) {
  const item = (useWatch({ control, name: `items.${index}` }) as any) ?? {};
  return (
    <Pressable onPress={onPress} style={styles.itemCard} accessibilityRole="button">
      <View style={styles.itemCardHead}>
        <Text style={styles.itemCardTitle}>ITEM {index + 1}</Text>
        <Pressable
          onPress={(e: any) => {
            // Prevent the outer card's onPress from firing (which would open
            // the preview modal for the now-deleted item).
            e?.stopPropagation?.();
            onRemove();
          }}
          accessibilityRole="button"
          accessibilityLabel={`Remove item ${index + 1}`}
          style={styles.itemRemoveBtn}
          hitSlop={8}
        >
          <Text style={styles.itemCardRemove}>×</Text>
        </Pressable>
      </View>
      {/* Row 1 — Challan No (left) · LR No (right) */}
      <View style={styles.itemKVPair}>
        <SummaryKVHalf label="CHALLAN NO" value={item.challan_no} />
        <SummaryKVHalf label="LR NO" value={item.lr_no} align="right" />
      </View>
      {/* Row 2 — From (left) · To (right) */}
      <View style={styles.itemKVPair}>
        <SummaryKVHalf label="FROM" value={item.from_loc} />
        <SummaryKVHalf label="TO" value={item.to_loc} align="right" />
      </View>
      {/* Row 3 — Consignee (full width) */}
      <SummaryKV label="CONSIGNEE" value={item.consignee} />
    </Pressable>
  );
}

// Half-width KV pair for the two-up card rows (Challan/LR, From/To). The
// right-hand cell anchors its label+value cluster to the row's right corner.
function SummaryKVHalf({
  label,
  value,
  align,
}: {
  label: string;
  value?: string | number;
  align?: 'left' | 'right';
}) {
  const v = value === undefined || value === null || value === '' ? '—' : String(value);
  return (
    <View style={[styles.itemKVHalf, align === 'right' && styles.itemKVHalfRight]}>
      <Text style={styles.itemKVHalfLabel}>{label}</Text>
      <Text style={styles.itemKVHalfValue} numberOfLines={1}>{v}</Text>
    </View>
  );
}

// Tight key-value row matching BiltyScreen card density (paddingVertical: 2,
// label left + value right on a single line).
function SummaryKV({ label, value }: { label: string; value?: string | number }) {
  const v = value === undefined || value === null || value === '' ? '—' : String(value);
  return (
    <View style={styles.summaryKVRow}>
      <Text style={styles.summaryKVLabel}>{label}</Text>
      <Text style={styles.summaryKVValue} numberOfLines={1}>{v}</Text>
    </View>
  );
}

// Label-above-value cell — used inside the modal preview where multiple values
// share a row (Qty / Rate / Inc, L-Rate / E-Rate, etc.).
function SummaryCell({ label, value }: { label: string; value?: string | number }) {
  const v = value === undefined || value === null || value === '' ? '—' : String(value);
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={1}>{v}</Text>
    </View>
  );
}

// ─── Item form fields (full set, rendered inside the modal) ─────────────────
function ItemFormFields({
  control,
  errors,
  index: i,
  onSave,
  onCancel,
  consignorOptions = [],
  destinationOptions = [],
  getValues,
}: {
  control: any;
  errors: any;
  index: number;
  onSave: () => void;
  onCancel: () => void;
  consignorOptions?: string[];
  destinationOptions?: string[];
  getValues: any;
}) {
  // Guided entry inside the item modal. Every field is gated: Challan → … →
  // Shipment → Save. Dropdowns (From/To/Consignee) force a listed pick; numeric
  // fields require > 0; text fields require non-empty.
  const MODAL_ORDER = ['challan_no', 'lr_no', 'from_loc', 'to_loc', 'consignee', 'qty', 'rate', 'inc_rate', 'l_rate', 'e_rate', 'shipment_no'];
  const MODAL_DL = new Set(['from_loc', 'to_loc', 'consignee']);
  const MODAL_NUM = new Set(['qty', 'rate', 'inc_rate', 'l_rate', 'e_rate']);
  const modalRefs = useRef<Record<string, { focus: () => void } | null>>({});
  const setModalRef = (col: string) => (r: { focus: () => void } | null) => { modalRefs.current[col] = r; };
  const isModalValid = (col: string): boolean => {
    const v = getValues(`items.${i}.${col}`);
    if (MODAL_NUM.has(col)) return Number(v) > 0;
    if (MODAL_DL.has(col)) {
      const opts = col === 'consignee' ? consignorOptions : destinationOptions;
      return !!v && opts.some((o) => o.toLowerCase() === String(v).trim().toLowerCase());
    }
    return String(v ?? '').trim() !== '';
  };
  const advanceModal = (col: string) => {
    if (!isModalValid(col)) return;
    const idx = MODAL_ORDER.indexOf(col);
    if (idx < MODAL_ORDER.length - 1) { modalRefs.current[MODAL_ORDER[idx + 1]]?.focus?.(); return; }
    // Last field → focus the Save button.
    if (Platform.OS === 'web') {
      (document.querySelector(`[data-modalsave="${i}"]`) as HTMLElement | null)?.focus?.();
    }
  };
  const advanceModalRef = useRef(advanceModal);
  advanceModalRef.current = advanceModal;
  // Tab gating for the CompactField (text/numeric) cells; the From/To/Consignee
  // dropdowns gate Tab themselves.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.shiftKey) return;
      const el = document.activeElement as HTMLElement | null;
      const cell = el?.dataset?.cell;
      if (!cell) return;
      const dot = cell.indexOf('.');
      if (cell.slice(0, dot) !== String(i)) return;
      const col = cell.slice(dot + 1);
      if (MODAL_DL.has(col)) return;
      e.preventDefault();
      advanceModalRef.current(col);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [i]);
  return (
    <View>
      {/* Row 1 — Challan No · LR No */}
      <View style={[styles.itemRow, styles.zRow4]}>
        <View style={styles.itemCol}>
          <Controller control={control} name={`items.${i}.challan_no`} render={({ field: f }) => (
            <CompactField ref={setModalRef('challan_no')} label="CHALLAN NO" value={String(f.value ?? '')} onChange={(v) => f.onChange(filterAlphanumeric(v))} onSubmitNext={() => advanceModal('challan_no')} dataSet={{ cell: `${i}.challan_no` }} />
          )} />
        </View>
        <View style={styles.itemCol}>
          <Controller control={control} name={`items.${i}.lr_no`} render={({ field: f }) => (
            <CompactField ref={setModalRef('lr_no')} label="LR NO" value={String(f.value ?? '')} onChange={(v) => f.onChange(filterAlphanumeric(v))} onSubmitNext={() => advanceModal('lr_no')} dataSet={{ cell: `${i}.lr_no` }} />
          )} />
        </View>
      </View>

      {/* Row 2 — From · To  (autocomplete from destination master) */}
      <View style={[styles.itemRow, styles.zRow3]}>
        <View style={styles.itemCol}>
          <Controller control={control} name={`items.${i}.from_loc`} render={({ field: f }) => (
            <AutocompleteField
              ref={setModalRef('from_loc')}
              compact
              label="FROM"
              value={String(f.value ?? '')}
              options={destinationOptions}
              onChangeText={f.onChange}
              placeholder=""
              onSubmitNext={() => advanceModal('from_loc')}
            />
          )} />
        </View>
        <View style={styles.itemCol}>
          <Controller control={control} name={`items.${i}.to_loc`} render={({ field: f }) => (
            <AutocompleteField
              ref={setModalRef('to_loc')}
              compact
              label="TO"
              value={String(f.value ?? '')}
              options={destinationOptions}
              onChangeText={f.onChange}
              placeholder=""
              onSubmitNext={() => advanceModal('to_loc')}
            />
          )} />
        </View>
      </View>

      {/* Row 3 — Consignee (full width, autocomplete from ledger_master) */}
      <View style={[styles.itemRow, styles.zRow2]}>
        <View style={styles.itemCol}>
          <Controller control={control} name={`items.${i}.consignee`} render={({ field: f }) => (
            <AutocompleteField
              ref={setModalRef('consignee')}
              compact
              label="CONSIGNEE"
              value={String(f.value ?? '')}
              options={consignorOptions}
              onChangeText={f.onChange}
              placeholder=""
              onSubmitNext={() => advanceModal('consignee')}
            />
          )} />
        </View>
      </View>

      {/* Row 4 — Qty · Rate · Inc Rate */}
      <View style={styles.itemRow}>
        <View style={styles.itemCol}>
          <Controller control={control} name={`items.${i}.qty`} render={({ field: f }) => (
            <CompactField ref={setModalRef('qty')} label="QTY *" value={String(f.value ?? '')} onChange={(v) => f.onChange(filterDecimal(v))} numeric error={errors.items?.[i]?.qty?.message ?? null} onSubmitNext={() => advanceModal('qty')} dataSet={{ cell: `${i}.qty` }} />
          )} />
        </View>
        <View style={styles.itemCol}>
          <Controller control={control} name={`items.${i}.rate`} render={({ field: f }) => (
            <CompactField ref={setModalRef('rate')} label="RATE *" value={String(f.value ?? '')} onChange={(v) => f.onChange(filterDecimal(v))} numeric error={errors.items?.[i]?.rate?.message ?? null} onSubmitNext={() => advanceModal('rate')} dataSet={{ cell: `${i}.rate` }} />
          )} />
        </View>
        <View style={styles.itemCol}>
          <Controller control={control} name={`items.${i}.inc_rate`} render={({ field: f }) => (
            <CompactField ref={setModalRef('inc_rate')} label="INC" value={String(f.value ?? '')} onChange={(v) => f.onChange(filterDecimal(v))} numeric onSubmitNext={() => advanceModal('inc_rate')} dataSet={{ cell: `${i}.inc_rate` }} />
          )} />
        </View>
      </View>

      {/* Row 5 — L-Rate · E-Rate · Shipment No */}
      <View style={styles.itemRow}>
        <View style={styles.itemCol}>
          <Controller control={control} name={`items.${i}.l_rate`} render={({ field: f }) => (
            <CompactField ref={setModalRef('l_rate')} label="L-RATE" value={String(f.value ?? '')} onChange={(v) => f.onChange(filterDecimal(v))} numeric onSubmitNext={() => advanceModal('l_rate')} dataSet={{ cell: `${i}.l_rate` }} />
          )} />
        </View>
        <View style={styles.itemCol}>
          <Controller control={control} name={`items.${i}.e_rate`} render={({ field: f }) => (
            <CompactField ref={setModalRef('e_rate')} label="E-RATE" value={String(f.value ?? '')} onChange={(v) => f.onChange(filterDecimal(v))} numeric onSubmitNext={() => advanceModal('e_rate')} dataSet={{ cell: `${i}.e_rate` }} />
          )} />
        </View>
        <View style={styles.itemCol}>
          <Controller control={control} name={`items.${i}.shipment_no`} render={({ field: f }) => (
            <CompactField ref={setModalRef('shipment_no')} label="SHIPMENT NO" value={String(f.value ?? '')} onChange={(v) => f.onChange(filterAlphanumeric(v))} onSubmitNext={() => advanceModal('shipment_no')} dataSet={{ cell: `${i}.shipment_no` }} />
          )} />
        </View>
      </View>

      {/* Modal action buttons */}
      <View style={styles.modalActions}>
        <Pressable onPress={onCancel} style={[styles.modalBtn, styles.modalBtnCancel]} accessibilityRole="button">
          <Text style={styles.modalBtnCancelText}>Cancel</Text>
        </Pressable>
        <Pressable onPress={onSave} style={[styles.modalBtn, styles.modalBtnSave]} accessibilityRole="button" {...({ dataSet: { modalsave: `${i}` } } as any)}>
          <Text style={styles.modalBtnSaveText}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Compact field (label + tight input) ─────────────────────────────────────
type CompactFieldHandle = { focus: () => void };
const CompactField = forwardRef<CompactFieldHandle, {
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
  error?: string | null;
  disabled?: boolean;
  /** Guided entry: Enter advances to the next cell. */
  onSubmitNext?: () => void;
  /** Web-only data-* attributes (guided-entry cell tagging). */
  dataSet?: Record<string, string>;
}>(function CompactField({
  label,
  value,
  onChange,
  numeric,
  error,
  disabled,
  onSubmitNext,
  dataSet,
}, ref) {
  const inputRef = useRef<TextInput>(null);
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus?.() }), []);
  // For numeric fields: show "0" as a faded placeholder when the underlying
  // value is zero, so the user doesn't have to manually delete the 0 before
  // typing. Empty input → store "0" so form state stays a valid number.
  const isZeroish =
    numeric && (value === '' || value === '0' || value === '0.0' || Number(value) === 0);
  const display = isZeroish ? '' : value;

  const handleChange = (v: string) => {
    if (numeric && v === '') {
      onChange('0');
    } else {
      onChange(v);
    }
  };

  return (
    <View style={styles.compactField}>
      <Text style={styles.compactLabel}>{label}</Text>
      <TextInput
        ref={inputRef}
        value={display}
        onChangeText={handleChange}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        editable={!disabled}
        placeholder={numeric ? '0' : undefined}
        placeholderTextColor={colors.textMuted}
        blurOnSubmit={false}
        onSubmitEditing={() => onSubmitNext?.()}
        style={[
          styles.compactInput,
          numeric && styles.compactInputRight,
          error && styles.compactInputError,
          disabled && styles.compactInputDisabled,
          Platform.OS === 'web' && ({ outlineStyle: 'none' } as any),
        ]}
        {...(dataSet ? ({ dataSet } as any) : {})}
      />
    </View>
  );
});

// ─── Compact date field — native <input type="date"> on web (shows the
// browser's calendar picker), text fallback on native. Reuses the CompactField
// label + input layout so it slots into existing item rows. ─────────────────
function DateField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
}) {
  return (
    <View style={styles.compactField}>
      <Text style={styles.compactLabel}>{label}</Text>
      {Platform.OS === 'web' ? (
        React.createElement('input', {
          type: 'date',
          value: value ?? '',
          onChange: (e: any) => onChange(e?.target?.value || ''),
          style: {
            ...compactDateInputStyle,
            borderColor: error ? '#DC2626' : '#CBD5E1',
          },
        })
      ) : (
        <TextInput
          value={value}
          onChangeText={(v) => onChange(filterDate(v))}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textMuted}
          style={[styles.compactInput, !!error && styles.compactInputError]}
        />
      )}
    </View>
  );
}

// ─── Section bar with optional inline action button ──────────────────────────
function SectionBar({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionBar}>
      <Text style={styles.sectionBarTitle}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={styles.sectionBarBtn} accessibilityRole="button">
          <Text style={styles.sectionBarBtnText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── Step 3: Preview ─────────────────────────────────────────────────────────
function PreviewView({
  header,
  items,
  gstNo,
}: {
  header: CreateBiltyInput['header'];
  items: CreateBiltyInput['items'];
  gstNo: string;
}) {
  const freightTotal = itemsTotal(items as any);
  const net = netPayable(items as any);
  return (
    <View style={styles.previewWrap}>
      <View style={styles.previewSheet}>
        <View style={styles.previewHeader}>
          <Text style={styles.previewBrand}>AB LOGISTICS</Text>
          <Text style={styles.previewDocLabel}>BILTY (PREVIEW)</Text>
        </View>

        <PreviewSection title="BILTY DETAILS">
          <View style={styles.gridRow}>
            <Cell label="Date" value={header.bilty_date ?? '—'} />
            <Cell label="Consignor" value={header.consignor || '—'} />
            <Cell label="Branch" value={header.branch || '—'} />
          </View>
          <View style={styles.gridRow}>
            <Cell label="GST No" value={gstNo || '—'} />
            <Cell label="Truck No" value={header.truck_no || '—'} />
            <Cell />
          </View>
          <View style={styles.gridRow}>
            <Cell label="Goods Type" value={header.goods_type || '—'} />
            <Cell label="Zone" value={header.zone_name || '—'} />
            <Cell label="Owner" value={header.owner_name || '—'} />
          </View>
          <View style={styles.gridRow}>
            <Cell label="Agent" value={header.agent_name || '—'} />
            <Cell />
            <Cell />
          </View>
        </PreviewSection>

        <PreviewSection title="ITEMS">
          {items.length === 0 ? (
            <Text style={styles.muted}>No items.</Text>
          ) : (
            items.map((it, i) => (
              <View key={i} style={styles.previewItemCard}>
                <Text style={styles.previewItemTitle}>ITEM {i + 1}</Text>
                <View style={styles.gridRow}>
                  <Cell label="Challan" value={it.challan_no || '—'} />
                  <Cell label="LR No" value={it.lr_no || '—'} />
                  <Cell label="Consignee" value={it.consignee || '—'} />
                </View>
                <View style={styles.gridRow}>
                  <Cell label="From" value={it.from_loc || '—'} />
                  <Cell label="To" value={it.to_loc || '—'} />
                  <Cell />
                </View>
                <View style={styles.gridRow}>
                  <Cell label="Qty" value={fmt(toNum(it.qty))} num />
                  <Cell label="Rate" value={fmt(toNum(it.rate))} num />
                  <Cell label="Inc" value={fmt(toNum(it.inc_rate))} num />
                </View>
                <View style={styles.gridRow}>
                  <Cell label="L-Rate" value={fmt(toNum(it.l_rate))} num />
                  <Cell label="E-Rate" value={fmt(toNum(it.e_rate))} num />
                  <Cell label="Line Total" value={fmt(toNum(it.qty) * toNum(it.rate))} num bold />
                </View>
              </View>
            ))
          )}
        </PreviewSection>

        <View style={styles.totalsBox}>
          <View style={styles.gridRow}>
            <Cell label="Freight Total" value={fmt(freightTotal)} num />
            <Cell />
            <Cell label="Net Payable" value={fmt(net)} num bold />
          </View>
        </View>
      </View>
    </View>
  );
}

function PreviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.previewSection}>
      <Text style={styles.previewSectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

// Single grid cell — label above value, takes 1/3 of row width.
function Cell({ label, value, num, bold }: { label?: string; value?: string; num?: boolean; bold?: boolean }) {
  return (
    <View style={styles.cellWrap}>
      {label ? <Text style={styles.cellLabel}>{label}</Text> : null}
      {value !== undefined ? (
        <Text
          style={[
            styles.cellValue,
            num && styles.cellValueNum,
            bold && styles.cellValueBold,
          ]}
          numberOfLines={1}
        >
          {value}
        </Text>
      ) : null}
    </View>
  );
}

// Cell that spans the full row (takes 3/3).
function CellSpan({ label, value }: { label: string; value: string }) {
  return (
    <View style={[styles.cellWrap, { flex: 3 }]}>
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue}>{value}</Text>
    </View>
  );
}

function fmt(n: number): string {
  const s = toNum(n).toFixed(2);
  return s.endsWith('.00') ? s.slice(0, -3) : s;
}

const webDateInputStyle = {
  width: '100%',
  boxSizing: 'border-box' as any,
  height: 40,
  padding: '0 12px',
  fontSize: 14,
  fontFamily: 'inherit',
  color: '#0F172A',
  backgroundColor: '#FFFFFF',
  border: '1px solid #CBD5E1',
  borderRadius: 6,
  outline: 'none',
};

// Web-only inline style for <input type="date"> inside item form rows.
// Mirrors styles.compactInput so it visually slots in with CompactField.
const compactDateInputStyle = {
  boxSizing: 'border-box' as any,
  height: 30,
  padding: '0 8px',
  fontSize: 12,
  fontFamily: 'inherit',
  fontWeight: 500,
  color: '#0F172A',
  backgroundColor: '#FFFFFF',
  borderWidth: 1,
  borderStyle: 'solid' as any,
  borderColor: '#CBD5E1',
  borderRadius: 6,
  width: '100%',
  outline: 'none',
};

const topDateInputStyle = {
  boxSizing: 'border-box' as any,
  height: 32,
  padding: '0 8px',
  fontSize: 12,
  fontFamily: 'inherit',
  fontWeight: 600,
  color: '#0F172A',
  backgroundColor: '#FFFFFF',
  border: '1px solid #CBD5E1',
  borderRadius: 6,
  outline: 'none',
  width: 132,
};

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: { fontSize: 22, color: '#475569', lineHeight: 22 },
  topTitle: { fontSize: 17, fontFamily: typography.uiHeavy, color: colors.textStrong, letterSpacing: 0.3 },
  topSubtitle: { fontSize: 11, color: colors.brandRed, fontFamily: typography.uiBold, marginTop: 2, letterSpacing: 0.5 },

  scroll: { flex: 1 },
  scrollContent: { padding: 12, paddingBottom: 16 },

  stepBody: { gap: 10 },

  // Section card — wraps an entire step's fields in a tight bordered box.
  section: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 1px 3px rgba(15,23,42,0.05)' } as any)
      : { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } }),
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: typography.uiHeavy,
    color: colors.textStrong,
    letterSpacing: 1.2,
    marginBottom: 4,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  fieldRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  fieldCol: { flex: 1, minWidth: 0 },

  // Decreasing z-index per row so an open dropdown in an EARLIER row paints
  // on top of LATER rows. Without this, the next row's input borders cover
  // the dropdown because they paint after in document order.
  zRow1: Platform.OS === 'web' ? ({ position: 'relative', zIndex: 10 } as any) : { zIndex: 10 },
  zRow2: Platform.OS === 'web' ? ({ position: 'relative', zIndex: 20 } as any) : { zIndex: 20 },
  zRow3: Platform.OS === 'web' ? ({ position: 'relative', zIndex: 30 } as any) : { zIndex: 30 },
  zRow4: Platform.OS === 'web' ? ({ position: 'relative', zIndex: 40 } as any) : { zIndex: 40 },
  zRow5: Platform.OS === 'web' ? ({ position: 'relative', zIndex: 50 } as any) : { zIndex: 50 },
  zRow6: Platform.OS === 'web' ? ({ position: 'relative', zIndex: 60 } as any) : { zIndex: 60 },
  zRow7: Platform.OS === 'web' ? ({ position: 'relative', zIndex: 70 } as any) : { zIndex: 70 },
  zRow8: Platform.OS === 'web' ? ({ position: 'relative', zIndex: 80 } as any) : { zIndex: 80 },

  // Tight section variant — used for repeating-row sections (Items / Advances / Fuel)
  // and Bilty Details. Overflow MUST stay 'visible' so autocomplete dropdowns
  // can render outside the section bounds on web.
  sectionTight: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 1px 3px rgba(15,23,42,0.05)' } as any)
      : { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } }),
  },
  sectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    // Match the parent's rounded top corners since we removed overflow:hidden.
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    // Sticky: stays pinned at the top of the wizard viewport while user scrolls
    // through items — so the "+ Add Item" button is always reachable without
    // scrolling back up.
    ...(Platform.OS === 'web'
      ? ({
          position: 'sticky',
          top: 0,
          zIndex: 50,
          boxShadow: '0 2px 6px rgba(15,23,42,0.06)',
        } as any)
      : {}),
  },
  // Tight bilty-details body — equal-padding container around the field rows.
  detailsBody: {
    padding: 10,
    gap: 8,
  },
  sectionBarTitle: {
    fontSize: 11,
    fontFamily: typography.uiHeavy,
    color: colors.textStrong,
    letterSpacing: 1.5,
  },
  sectionBarBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.brandRed,
  },
  sectionBarBtnText: {
    fontSize: 11,
    fontFamily: typography.uiHeavy,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  itemsList: { padding: 8, gap: 6 },

  // Tight item card (one card per dynamic row — Item / Advance / Fuel).
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingTop: 5,
    paddingBottom: 6,
    gap: 2,
  },
  itemCardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 3,
    marginBottom: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },

  // Two-up KV row inside the item summary card (Challan/LR, From/To).
  itemKVPair: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  itemKVHalf: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    minWidth: 0,
  },
  itemKVHalfRight: {
    justifyContent: 'flex-end',
  },
  itemKVHalfLabel: {
    color: colors.textMuted,
    fontFamily: typography.uiMedium,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  itemKVHalfValue: {
    color: colors.textStrong,
    fontFamily: typography.uiMedium,
    fontSize: 13,
    flexShrink: 1,
  },
  itemCardTitle: {
    fontSize: 10,
    fontFamily: typography.uiHeavy,
    color: colors.brandRed,
    letterSpacing: 1.5,
  },
  itemCardRemove: {
    color: colors.danger,
    fontSize: 22,
    lineHeight: 22,
    fontFamily: typography.uiBold,
  },
  itemRemoveBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  itemRow: { flexDirection: 'row', gap: 6 },
  itemCol: { flex: 1, minWidth: 0 },

  // Item summary card — tight KV row (label left, value right) matching
  // the BiltyScreen list card density.
  summaryKVRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 2,
    gap: spacing.sm,
  },
  summaryKVLabel: {
    color: colors.textMuted,
    fontFamily: typography.uiMedium,
    fontSize: 12,
  },
  summaryKVValue: {
    color: colors.textStrong,
    fontFamily: typography.uiMedium,
    fontSize: 13,
    flexShrink: 1,
    textAlign: 'right',
  },
  // Override for inline KV pairs where the value should sit immediately to
  // the right of the label (no gap, left-aligned), e.g. "NARRATION text".
  summaryKVValueLeft: {
    textAlign: 'left',
  },

  // Half-width KV pair — used when two label/value pairs share one row
  // (e.g. Advance card: FROM at left, AMOUNT at right).
  summaryKVHalf: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    minWidth: 0,
  },
  summaryKVHalfRight: {
    justifyContent: 'flex-end',
  },

  // Card header right cluster — date label sitting next to the × button.
  itemCardHeadRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemCardDate: {
    color: colors.textMuted,
    fontFamily: typography.uiMedium,
    fontSize: 12,
    letterSpacing: 0.2,
  },

  // Stacked label-above-value (used in modal preview for grouped numeric rows).
  summaryRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  summaryCell: { flex: 1, paddingVertical: 4 },
  summaryLabel: {
    fontSize: 10,
    fontFamily: typography.uiHeavy,
    color: colors.textMuted,
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  summaryValue: {
    fontSize: 13,
    fontFamily: typography.ui,
    color: colors.text,
  },

  // Modal action row (Cancel / Save) at bottom of item edit modal.
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.lg,
    justifyContent: 'flex-end',
  },
  modalBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    minWidth: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnCancel: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalBtnCancelText: {
    color: colors.text,
    fontFamily: typography.uiHeavy,
    fontSize: 13,
  },
  modalBtnSave: {
    backgroundColor: colors.brandRed,
  },
  modalBtnSaveText: {
    color: '#FFFFFF',
    fontFamily: typography.uiHeavy,
    fontSize: 13,
  },

  // Compact label/input pair used inside item cards.
  compactField: { gap: 1 },
  compactLabel: {
    fontSize: 9,
    fontFamily: typography.uiHeavy,
    color: colors.textMuted,
    letterSpacing: 0.6,
  },
  compactInput: {
    height: 30,
    paddingHorizontal: 8,
    fontSize: 12,
    color: colors.textStrong,
    fontFamily: typography.uiMedium,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 5,
  },
  compactInputRight: { textAlign: 'right', fontFamily: typography.mono, color: colors.textStrong, fontWeight: '700' },
  compactInputError: { borderColor: colors.danger },
  compactInputDisabled: { backgroundColor: '#F8FAFC', borderStyle: 'dashed', color: colors.textMuted },

  // Top-bar date control
  topDateWrap: { alignItems: 'flex-end', gap: 2 },
  topDateLabel: {
    fontSize: 9,
    fontFamily: typography.uiHeavy,
    color: colors.textMuted,
    letterSpacing: 1.5,
  },
  topDateValue: {
    fontSize: 13,
    fontFamily: typography.uiBold,
    color: colors.textStrong,
  },

  subCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radius.sm,
    padding: 10,
    gap: 8,
  },
  subCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  subCardTitle: { fontSize: 12, fontFamily: typography.uiHeavy, color: colors.textStrong, letterSpacing: 1 },
  subCardRemoveBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  subCardRemoveText: { color: colors.danger, fontSize: 22, lineHeight: 22, fontFamily: typography.uiBold },

  row2: { flexDirection: 'row', gap: spacing.sm },

  addBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addBtnText: { color: colors.primary, fontFamily: typography.uiBold, fontSize: 14 },

  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  saveErrorBar: {
    backgroundColor: '#FEF2F2',
    borderTopWidth: 1,
    borderTopColor: 'rgba(247,72,61,0.25)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  saveErrorText: {
    color: colors.danger,
    fontFamily: typography.uiBold,
    fontSize: 12.5,
    textAlign: 'center',
  },
  btnGhost: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: '#F1F5F9',
  },
  btnGhostText: { color: '#475569', fontFamily: typography.uiBold, fontSize: 13, letterSpacing: 0.3 },
  btnDanger: {
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: '#FEE2E2',
  },
  btnDangerText: { color: '#B91C1C', fontFamily: typography.uiBold, fontSize: 13, letterSpacing: 0.3 },

  label: { fontSize: 12, color: colors.textLabel, fontFamily: typography.uiBold, letterSpacing: 0.2 },
  errText: { color: colors.danger, fontFamily: typography.uiBold, fontSize: 13 },
  muted: { color: colors.textMuted, fontFamily: typography.ui, fontSize: 13, paddingVertical: spacing.sm },

  // Preview
  previewWrap: { paddingBottom: spacing.lg },
  // Full-bleed on mobile: no border / shadow / rounded card chrome, so the
  // preview reads as one flat surface inside the wizard rather than a card
  // nested inside the wizard card. Section separators below still divide it.
  previewSheet: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  previewHeader: {
    alignItems: 'center',
    paddingBottom: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: '#0F172A',
    marginBottom: spacing.md,
  },
  previewBrand: {
    fontSize: 20,
    fontFamily: typography.uiHeavy,
    color: colors.brandRed,
    letterSpacing: 3,
  },
  previewDocLabel: {
    fontSize: 11,
    fontFamily: typography.uiBold,
    color: colors.textMuted,
    letterSpacing: 4,
    marginTop: 4,
  },
  previewSection: { marginBottom: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  previewSectionTitle: {
    fontSize: 11,
    fontFamily: typography.uiHeavy,
    color: colors.textStrong,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  previewItemCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 8,
    marginBottom: 6,
    gap: 4,
  },
  previewItemTitle: {
    fontSize: 10,
    fontFamily: typography.uiHeavy,
    color: colors.brandRed,
    letterSpacing: 1.5,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginBottom: 2,
  },

  // 3-column grid for preview cells
  gridRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  cellWrap: { flex: 1, minWidth: 0 },
  cellLabel: {
    fontSize: 9,
    fontFamily: typography.uiHeavy,
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  cellValue: {
    fontSize: 12,
    fontFamily: typography.uiMedium,
    color: colors.textStrong,
  },
  cellValueNum: { fontFamily: typography.mono },
  cellValueBold: { fontFamily: typography.uiHeavy, color: colors.brandRed },

  totalsBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(247,72,61,0.2)',
    padding: 10,
    marginTop: 4,
  },
});
