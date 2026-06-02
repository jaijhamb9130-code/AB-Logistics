/**
 * BiltyFormScreen — Phase 4 refactor to React Hook Form + Zod.
 *
 * State is now managed by RHF; validation delegated to CreateBiltySchema.
 * Dynamic items table uses useFieldArray.
 * Save delegates to useBiltyCreate mutation (TanStack Query).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
} from 'react-hook-form';
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
import { useNavigation, useRoute, useFocusEffect, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ButtonPrimary } from '../components/ButtonPrimary';
import { InputField } from '../components/InputField';
import { Loader } from '../components/Loader';
import { AutocompleteField } from '../components/AutocompleteField';
import { ledgerMasterService } from '../services/ledgerMasterService';
import { ledgerGroupService } from '../services/ledgerGroupService';
import { itemMasterService } from '../services/itemMasterService';
import { vehicleMasterService } from '../services/vehicleMasterService';
import { destinationService } from '../services/destinationService';
import { zoneService } from '../services/zoneService';
import { ownerService } from '../services/ownerService';
import { agentService } from '../services/agentService';
import { branchService } from '../services/branchService';
import { colors, radius, spacing, typography } from '../constants/theme';
import { useBiltyCreate, useBiltyUpdate } from '../hooks/useBiltyUpdate';
import { biltyService } from '../services/biltyService';
import { CreateBiltySchema } from '../../../shared/schemas/bilty.schema';
import type { CreateBiltyInput } from '../../../shared/schemas/bilty.schema';
import { itemsTotal, netPayable, toNum } from '../utils/biltyValidation';
import { getTodayISO } from '../utils/dateUtils';
import type { BiltyStackParamList } from '../navigation/types';
import { useResponsive } from '../hooks/useResponsive';
import { MobileBiltyFormScreen } from './MobileBiltyFormScreen';
import { useAuth } from '../context/AuthContext';
import { canDoAction } from '../navigation/guards';

type Nav = NativeStackNavigationProp<BiltyStackParamList, 'BiltyForm'>;
type BiltyFormRoute = RouteProp<BiltyStackParamList, 'BiltyForm'>;

function toNumStr(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function toDateStr(v: unknown): string {
  if (!v) return '';
  return String(v).slice(0, 10);
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

const EMPTY_ITEM: CreateBiltyInput['items'][number] = {
  challan_no: '', lr_no: '', shipment_no: '',
  from_loc: '', to_loc: '', consignee: '',
  qty: 0, rate: 0, inc_rate: 0, l_rate: 0, e_rate: 0,
};

/**
 * Top-level dispatcher — delegates to mobile wizard or desktop single-page form.
 * Keeping the dispatch above the heavy form hooks ensures rules-of-hooks aren't
 * violated when the viewport flips between mobile and desktop.
 */
export function BiltyFormScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<BiltyFormRoute>();
  const { isMobile } = useResponsive();
  const { user } = useAuth();

  // Either `id` (DB pk, what the API uses) or `bilty_no` (the human-readable
  // number that appears in the URL via /edit/bilty/:bilty_no). When only the
  // bilty_no is supplied — e.g. the user lands on the URL directly — resolve
  // it to an id via /api/bilty/by-no/:no and then load as usual.
  const routeId = route.params?.id ?? null;
  const routeBiltyNo = route.params?.bilty_no ?? null;
  const [editingId, setEditingId] = useState<number | null>(routeId);
  useEffect(() => {
    if (routeId !== null) { setEditingId(routeId); return; }
    if (!routeBiltyNo) { setEditingId(null); return; }
    let cancelled = false;
    biltyService.idByNo(String(routeBiltyNo)).then((id) => {
      if (!cancelled) setEditingId(id);
    });
    return () => { cancelled = true; };
  }, [routeId, routeBiltyNo]);

  const isEdit = editingId !== null || routeBiltyNo !== null;

  // Bilties ARE vouchers, so voucher.edit / voucher.create also count.
  // Lets a daybook-only staff member (voucher.edit, no bilty.*) edit a
  // bilty row via the daybook pencil — exactly the flow the user spec'd.
  const canSave = isEdit
    ? canDoAction(user, 'bilty', 'edit') || canDoAction(user, 'voucher', 'edit')
    : canDoAction(user, 'bilty', 'create') || canDoAction(user, 'voucher', 'create');

  if (isMobile) {
    return (
      <MobileBiltyFormScreen
        editingId={editingId}
        onClose={() => navigation.goBack()}
        onSaved={() => {
          // After save, land where the user can actually go: BiltyList for
          // users with `bilty.view`, otherwise the Daybook (which is the
          // entry point for staff who edit bilty rows via voucher perms
          // without owning the Bilty page itself).
          if (canDoAction(user, 'bilty', 'view')) {
            navigation.navigate('BiltyList');
          } else {
            (navigation as any).navigate('Billing', { screen: 'Daybook' });
          }
        }}
        canSave={canSave}
      />
    );
  }
  return <DesktopBiltyForm canSave={canSave} editingId={editingId} />;
}

/**
 * Embeddable "create bilty" form for the Vouchers screen's "Bilty" vch type.
 * Always opens in new mode (no route params). On desktop it renders the
 * single-page bilty form; on mobile it renders the step1 → step2 → preview →
 * save wizard (same as the standalone mobile bilty flow). On save it navigates
 * to the Reports (bilty list) screen.
 */
export function BiltyCreateFormEmbedded({ onExit }: { onExit?: () => void }) {
  const { user } = useAuth();
  const { isMobile } = useResponsive();
  const navigation = useNavigation<Nav>();
  const canSave =
    canDoAction(user, 'bilty', 'create') || canDoAction(user, 'voucher', 'create');
  if (isMobile) {
    return (
      <MobileBiltyFormScreen
        editingId={null}
        canSave={canSave}
        // Close (X) returns to the voucher form (host resets the type) rather
        // than navigating out of the page.
        onClose={() => { if (onExit) onExit(); else navigation.goBack(); }}
        onSaved={() => { if (onExit) onExit(); (navigation as any).navigate('BiltyList'); }}
      />
    );
  }
  return <DesktopBiltyForm canSave={canSave} editingId={null} embedded />;
}

function DesktopBiltyForm({ canSave, editingId, embedded = false }: { canSave: boolean; editingId: number | null; embedded?: boolean }) {
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const isEdit = editingId != null;

  const { mutateAsync: createBilty, isPending: creating } = useBiltyCreate();
  const { mutateAsync: updateBilty, isPending: updating } = useBiltyUpdate(editingId ?? 0);
  const saving = creating || updating;

  const [loading, setLoading] = useState<boolean>(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);
  // GST No is shown on the bilty header but the API/schema doesn't yet carry
  // it — kept in local state until the backend exposes a `gst_no` column.
  const [gstNo, setGstNo] = useState<string>('');

  // Master data — sourced from Ledger pages. Fetched in parallel on mount;
  // failures are silent (autocomplete just won't have options for that field).
  // NOTE: Owner Name is intentionally NOT linked to Owner Master here — the
  // field is a free-text input on the bilty form. Reconnect later if needed.
  const [partyOptions, setPartyOptions] = useState<string[]>([]);
  const [debtorOptions, setDebtorOptions] = useState<string[]>([]);
  // Map consignor name → GST so the form can auto-fill GST No when a known
  // consignor is selected.
  const [partyGstMap, setPartyGstMap] = useState<Record<string, string>>({});
  const [agentOptions, setAgentOptions] = useState<string[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<string[]>([]);
  const [zoneOptions, setZoneOptions] = useState<string[]>([]);
  const [itemOptions, setItemOptions] = useState<string[]>([]);
  // Map item-name → batch flag, so the bilty form can decide whether the
  // selected goods_type allows multiple per-line entries (batch=Yes) or just
  // a single summary line (batch=No).
  const [itemBatchMap, setItemBatchMap] = useState<Record<string, boolean>>({});
  // name → gst_rate for the picked Goods Type, used by the totals preview to
  // show GST without the user having to enter a rate.
  const [itemGstRateMap, setItemGstRateMap] = useState<Record<string, number>>({});
  // name → unit (e.g. "ton" / "bag") shown next to Qty in the items table.
  const [itemUnitMap, setItemUnitMap] = useState<Record<string, string>>({});
  const [vehicleNoOptions, setVehicleNoOptions] = useState<string[]>([]);
  const [branchOptions, setBranchOptions] = useState<string[]>([]);
  const [destinationOptions, setDestinationOptions] = useState<string[]>([]);

  // Re-fetch master-data dropdowns every time the screen comes into focus,
  // so newly-created ledgers / items / vehicles / destinations show up
  // without a full app reload.
  useFocusEffect(
    useCallback(() => {
      Promise.allSettled([
        // Customer-side ledgers (Consignor / Bill-To / Consignee) — pulled
        // from ledger_master, filtered to the Sundry Debtors group when
        // present. Build a name→GST map for GST No auto-fill on consignor.
        Promise.all([
          ledgerGroupService.list(),
          ledgerMasterService.list(null),
        ]).then(([groups, ledgers]) => {
          setPartyOptions(ledgers.map((r) => r.name).sort());
          const gstMap: Record<string, string> = {};
          ledgers.forEach((r) => {
            if (r.name && (r as any).gst_no) gstMap[r.name] = String((r as any).gst_no);
          });
          setPartyGstMap(gstMap);

          const debtorGroupId =
            groups.find((g) => g.group_name.toLowerCase() === 'sundry debtors')?.id ?? null;
          const debtors = debtorGroupId != null
            ? ledgers.filter((r) => r.ledger_group_id === debtorGroupId)
            : ledgers;
          setDebtorOptions(debtors.map((r) => r.name).sort());
        }),
        // Owner / Agent now live in their own master tables.
        ownerService.list().then((rs) => setOwnerOptions(rs.map((r) => r.name).sort())),
        agentService.list().then((rs) => setAgentOptions(rs.map((r) => r.name).sort())),
        zoneService.list().then((rs) => setZoneOptions(rs.map((r) => r.name).sort())),
        itemMasterService.list().then((rs) => {
          // Bilty Goods Type is restricted to items with batch = Yes — line
          // items inside a bilty always need per-batch tracking, so non-batch
          // items aren't a valid pick here.
          const batched = rs.filter((r) => (r as any).batch === 'Yes');
          setItemOptions(batched.map((r) => r.name).sort());
          const map: Record<string, boolean> = {};
          const rateMap: Record<string, number> = {};
          const unitMap: Record<string, string> = {};
          batched.forEach((r) => {
            map[r.name] = true;
            const rate = Number((r as any).gst_rate ?? 0);
            if (Number.isFinite(rate)) rateMap[r.name] = rate;
            const u = (r as any).unit;
            if (u) unitMap[r.name] = String(u);
          });
          setItemBatchMap(map);
          setItemGstRateMap(rateMap);
          setItemUnitMap(unitMap);
        }),

        vehicleMasterService.list().then((rs) =>
          setVehicleNoOptions(rs.map((r) => r.name).sort())
        ),
        // Branch is now a real master (branch_master). Stored as branch_id FK.
        branchService.list().then((rs) => setBranchOptions(rs.map((r) => r.name).sort())),
        destinationService.list().then((rs) =>
          setDestinationOptions(
            [...new Set(rs.map((r) => r.name).filter((v): v is string => Boolean(v)))].sort()
          )
        ),
      ]);
    }, [])
  );

  // Customer-side fields use the debtor list. Falls back to partyOptions if
  // Sundry Debtors group isn't seeded yet.
  const consignorOptions = debtorOptions.length > 0 ? debtorOptions : partyOptions;

  const {
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<CreateBiltyInput>({
    resolver: zodResolver(CreateBiltySchema),
    defaultValues: {
      header: EMPTY_HEADER,
      items: [{ ...EMPTY_ITEM }],
    },
  });

  // Set dynamic header title based on mode. When editing an existing bilty,
  // append the bilty number (e.g. "Edit Bilty / 18520") so the user always
  // sees which voucher they're editing — re-renders as the field is edited.
  const titleBiltyNo = useWatch({ control, name: 'header.bilty_no' });
  useEffect(() => {
    // When embedded (e.g. inside the Vouchers "Bilty" vch type), never touch
    // the host screen's navigation header — that's what was leaking a stray
    // "New Bilty" title onto the Vouchers page.
    if (embedded) return;
    const suffix =
      isEdit && typeof titleBiltyNo === 'string' && titleBiltyNo.trim() !== ''
        ? ` / ${titleBiltyNo.trim()}`
        : '';
    navigation.setOptions({
      title: (isEdit ? 'Edit Bilty' : 'New Bilty') + suffix,
      headerShown: true,
    });
  }, [navigation, isEdit, titleBiltyNo, embedded]);

  // Load existing bilty when editing
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
            bill_to: (detail as any).bill_to ?? '',
            owner_name: detail.owner_name ?? '',
            agent_name: detail.agent_name ?? '',
            branch: detail.branch ?? '',
            zone_name: detail.zone_name ?? '',
            truck_no: detail.truck_no ?? '',
            goods_type: detail.goods_type ?? '',
          },
          items: (detail.items && detail.items.length > 0
            ? detail.items.map((it) => ({
                challan_no: it.challan_no ?? '',
                lr_no: it.lr_no ?? '',
                shipment_no: (it as any).shipment_no ?? '',
                from_loc: it.from_loc ?? '',
                to_loc: it.to_loc ?? '',
                consignee: it.consignee ?? '',
                qty: toNumStr(it.qty),
                rate: toNumStr(it.rate),
                inc_rate: toNumStr((it as any).inc_rate),
                l_rate: toNumStr((it as any).l_rate),
                e_rate: toNumStr((it as any).e_rate),
              }))
            : [{ ...EMPTY_ITEM }]),
        });
      } catch (_e) {
        if (!cancelled) setLoadError('Could not load bilty. Try again.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isEdit, editingId, reset]);

  const { fields: itemFields, append: appendItem, remove: removeItem } =
    useFieldArray({ control, name: 'items' });

  // Watch the header goods_type so we can flip the items section between
  // "single summary line" (batch=No) and "multi-line breakdown" (batch=Yes).
  const watchedGoodsType = useWatch({ control, name: 'header.goods_type' });
  const goodsTypeIsBatch =
    typeof watchedGoodsType === 'string' && itemBatchMap[watchedGoodsType] === true;

  // Auto-fill GST No when the user selects a known consignor. Only overwrites
  // GST when the new consignor has one stored — never blanks an explicit value
  // the user has typed. The GST field is local state (see comment near
  // `gstNo` declaration above) so we update it directly, not via RHF.
  const watchedConsignor = useWatch({ control, name: 'header.consignor' });
  useEffect(() => {
    if (typeof watchedConsignor !== 'string') return;
    const gst = partyGstMap[watchedConsignor];
    if (!gst) return;
    setGstNo((prev) => (prev === gst ? prev : gst));
  }, [watchedConsignor, partyGstMap]);

  // Auto-suggest next bilty number per branch — only when creating, and only
  // when the user hasn't typed a number yet. Editing existing bilties keeps
  // their current number untouched.
  const watchedBranch = useWatch({ control, name: 'header.branch' });
  useEffect(() => {
    if (isEdit) return;
    const branch = typeof watchedBranch === 'string' ? watchedBranch.trim() : '';
    if (!branch) return;
    const current = (getValues('header.bilty_no') || '').trim();
    if (current) return;
    let cancelled = false;
    biltyService
      .nextNo(branch)
      .then((next) => {
        if (cancelled) return;
        const stillEmpty = (getValues('header.bilty_no') || '').trim() === '';
        if (stillEmpty) setValue('header.bilty_no', next, { shouldDirty: false });
      })
      .catch(() => { /* silent — user can still type one manually */ });
    return () => { cancelled = true; };
  }, [watchedBranch, isEdit, getValues, setValue]);

  const watchedItems = useWatch({ control, name: 'items' });

  const onSave = handleSubmit(async (data) => {
    try {
      if (isEdit && editingId !== null) {
        await updateBilty(data);
      } else {
        await createBilty(data);
      }
      // Land where the user can go: BiltyList if they have `bilty.view`,
      // otherwise the Daybook (which is how staff with only voucher.* perms
      // reached this form).
      if (canDoAction(user, 'bilty', 'view')) {
        navigation.navigate('BiltyList');
      } else {
        (navigation as any).navigate('Billing', { screen: 'Daybook' });
      }
    } catch (err: any) {
      const apiErr = err?.response?.data?.error;
      if (apiErr?.fields) {
        Object.entries(apiErr.fields).forEach(([field, msg]) => {
          setError(field as Parameters<typeof setError>[0], { message: msg as string });
        });
      }
    }
  });

  const formError =
    errors.header?.bilty_no?.message ||
    errors.header?.consignor?.message ||
    errors.header?.truck_no?.message ||
    errors.items?.message ||
    errors.items?.root?.message ||
    null;

  if (isEdit && loading) {
    return (
      <View style={[styles.wrap, styles.centerWrap]}>
        <Loader />
      </View>
    );
  }

  if (isEdit && loadError) {
    return (
      <View style={[styles.wrap, styles.centerWrap]}>
        <View style={styles.formError}>
          <Text style={styles.formErrorText}>{loadError}</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {formError ? (
        <View style={styles.formError}>
          <Text style={styles.formErrorText}>{formError}</Text>
        </View>
      ) : null}

      {/* Row 1 — Bilty No · Branch · GST No · Date */}
      <View style={[styles.gridRow, { zIndex: 30 }]}>
        <View style={styles.fieldThird}>
          <Controller
            control={control}
            name="header.bilty_no"
            render={({ field: { value, onChange } }) => (
              <InputField
                label="Bilty No *"
                value={value ?? ''}
                onChangeText={(v) => onChange(v.replace(/\D/g, ''))}
                fieldType="integer"
                keyboardType="number-pad"
                placeholder="e.g. 8400153862"
                error={errors.header?.bilty_no?.message ?? null}
                testID="bilty-no-input"
              />
            )}
          />
        </View>
        <View style={styles.fieldThird}>
          <Controller
            control={control}
            name="header.branch"
            render={({ field: { value, onChange } }) => (
              <AutocompleteField
                label="Branch"
                value={value ?? ''}
                options={branchOptions}
                onChangeText={onChange}
                placeholder=""
              />
            )}
          />
        </View>
        <View style={styles.fieldThird}>
          <InputField
            label="GST No"
            value={gstNo}
            onChangeText={(v) => setGstNo(v.toUpperCase())}
            fieldType="alphanumeric"
            autoCapitalize="characters"
            placeholder="22AAAAA0000A1Z5"
            testID="bilty-gst-input"
          />
        </View>
        <View style={styles.fieldThird}>
          <Controller
            control={control}
            name="header.bilty_date"
            render={({ field: { value, onChange } }) => (
              <View style={{ gap: 4 }}>
                <Text style={styles.dateLabel}>Date</Text>
                {Platform.OS === 'web' ? (
                  React.createElement('input', {
                    type: 'date',
                    value: value ?? '',
                    onChange: (e: any) => onChange(e?.target?.value || ''),
                    'data-testid': 'bilty-date-input',
                    style: {
                      width: '100%',
                      boxSizing: 'border-box',
                      height: 38,
                      padding: '0 12px',
                      fontSize: 14,
                      fontFamily: 'inherit',
                      color: '#0F172A',
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #CBD5E1',
                      borderRadius: 6,
                      outline: 'none',
                    },
                  })
                ) : (
                  <InputField
                    label=""
                    value={value ?? ''}
                    onChangeText={onChange}
                    fieldType="date"
                    placeholder="YYYY-MM-DD"
                    testID="bilty-date-input"
                  />
                )}
              </View>
            )}
          />
        </View>
      </View>

      {/* Row 2 — Consignor · Owner Name · Agent Name · Bill To */}
      <View style={[styles.gridRow, { zIndex: 20 }]}>
        <View style={styles.fieldThird}>
          <Controller
            control={control}
            name="header.consignor"
            render={({ field: { value, onChange } }) => (
              <AutocompleteField
                label="Consignor *"
                value={value}
                options={consignorOptions}
                onChangeText={onChange}
                placeholder=""
                error={errors.header?.consignor?.message ?? null}
                testID="consignor-input"
              />
            )}
          />
        </View>
        <View style={styles.fieldThird}>
          <Controller
            control={control}
            name="header.owner_name"
            render={({ field: { value, onChange } }) => (
              <AutocompleteField
                label="Owner Name"
                value={value ?? ''}
                options={ownerOptions}
                onChangeText={onChange}
                placeholder=""
              />
            )}
          />
        </View>
        <View style={styles.fieldThird}>
          <Controller
            control={control}
            name="header.agent_name"
            render={({ field: { value, onChange } }) => (
              <AutocompleteField
                label="Agent Name"
                value={value ?? ''}
                options={agentOptions}
                onChangeText={onChange}
                placeholder=""
              />
            )}
          />
        </View>
        <View style={styles.fieldThird}>
          <Controller
            control={control}
            name="header.bill_to"
            render={({ field: { value, onChange } }) => (
              <AutocompleteField
                label="Bill To"
                value={value ?? ''}
                options={consignorOptions}
                onChangeText={onChange}
                placeholder=""
              />
            )}
          />
        </View>
      </View>

      {/* Row 3 — Truck No · Truck Type · Goods Type · Zone */}
      <View style={[styles.gridRow, { zIndex: 10 }]}>
        <View style={styles.fieldThird}>
          <Controller
            control={control}
            name="header.truck_no"
            render={({ field: { value, onChange } }) => (
              <AutocompleteField
                label="Truck No *"
                value={value ?? ''}
                options={vehicleNoOptions}
                onChangeText={(v) => onChange(v.toUpperCase())}
                error={errors.header?.truck_no?.message ?? null}
                placeholder=""
                testID="truck-no-input"
              />
            )}
          />
        </View>
        <View style={styles.fieldThird}>
          <Controller
            control={control}
            name="header.goods_type"
            render={({ field: { value, onChange } }) => (
              <AutocompleteField
                label="Goods Type"
                value={value ?? ''}
                options={itemOptions}
                onChangeText={onChange}
                placeholder=""
                testID="goods-type-input"
              />
            )}
          />
        </View>
        <View style={styles.fieldThird}>
          <Controller
            control={control}
            name="header.zone_name"
            render={({ field: { value, onChange } }) => (
              <AutocompleteField
                label="Zone"
                value={value ?? ''}
                options={zoneOptions}
                onChangeText={onChange}
                placeholder=""
              />
            )}
          />
        </View>
      </View>

      {/* ---- Items ---- */}
      {/* Multi-line breakdown only when the picked goods_type item is
          batch=Yes. Otherwise the bilty stays at a single summary line. */}
      <SectionBar
        title="Items"
        onAdd={() => appendItem({ ...EMPTY_ITEM })}
        addLabel="+ Add item"
        testID="add-item-btn"
      />
      {errors.items?.message ? (
        <Text style={styles.sectionError}>{errors.items.message}</Text>
      ) : null}
      <View style={styles.tableOuter}>
        <View style={[styles.row, styles.headerRow]}>
          <HeaderCell w={95}>Challan</HeaderCell>
          <HeaderCell w={95}>LR No</HeaderCell>
          <HeaderCell w={130}>Shipment No</HeaderCell>
          <HeaderCell w={115}>From</HeaderCell>
          <HeaderCell w={115}>To</HeaderCell>
          <HeaderCell>Consignee</HeaderCell>
          <HeaderCell w={75} align="right">Qty</HeaderCell>
          <HeaderCell w={85} align="right">Rate</HeaderCell>
          <HeaderCell w={70} align="right">Inc</HeaderCell>
          <HeaderCell w={75} align="right">L-Rate</HeaderCell>
          <HeaderCell w={75} align="right">E-Rate</HeaderCell>
          <HeaderCell w={36}> </HeaderCell>
        </View>
        {itemFields.map((field, i) => (
          <View key={field.id} style={[styles.row, i % 2 === 1 && styles.altRow]}>
            <Cell w={95}><Controller control={control} name={`items.${i}.challan_no`} render={({ field: f }) => <RowInput value={String(f.value ?? '')} onChangeText={f.onChange} filterFn={filterAlphanumeric} />} /></Cell>
            <Cell w={95}><Controller control={control} name={`items.${i}.lr_no`} render={({ field: f }) => <RowInput value={String(f.value ?? '')} onChangeText={f.onChange} filterFn={filterAlphanumeric} />} /></Cell>
            <Cell w={130}><Controller control={control} name={`items.${i}.shipment_no`} render={({ field: f }) => <RowInput value={String(f.value ?? '')} onChangeText={f.onChange} filterFn={filterAlphanumeric} />} /></Cell>
            <Cell w={115}><Controller control={control} name={`items.${i}.from_loc`} render={({ field: f }) => <RowDatalist value={String(f.value ?? '')} onChangeText={f.onChange} options={destinationOptions} filterFn={filterLetters} />} /></Cell>
            <Cell w={115}><Controller control={control} name={`items.${i}.to_loc`} render={({ field: f }) => <RowDatalist value={String(f.value ?? '')} onChangeText={f.onChange} options={destinationOptions} filterFn={filterLetters} />} /></Cell>
            <Cell><Controller control={control} name={`items.${i}.consignee`} render={({ field: f }) => <RowDatalist value={String(f.value ?? '')} onChangeText={f.onChange} options={consignorOptions} filterFn={filterLetters} />} /></Cell>
            <Cell w={75} align="right">
              <Controller control={control} name={`items.${i}.qty`} render={({ field: f }) => (
                <RowInput numeric value={f.value ? String(f.value) : ''} onChangeText={(v) => f.onChange(v)} testID={`item-qty-${i}`} error={errors.items?.[i]?.qty?.message} />
              )} />
            </Cell>
            <Cell w={85} align="right">
              <Controller control={control} name={`items.${i}.rate`} render={({ field: f }) => (
                <RowInput numeric value={f.value ? String(f.value) : ''} onChangeText={(v) => f.onChange(v)} testID={`item-rate-${i}`} error={errors.items?.[i]?.rate?.message} />
              )} />
            </Cell>
            <Cell w={70} align="right"><Controller control={control} name={`items.${i}.inc_rate`} render={({ field: f }) => <RowInput numeric value={f.value ? String(f.value) : ''} onChangeText={(v) => f.onChange(v)} />} /></Cell>
            <Cell w={75} align="right"><Controller control={control} name={`items.${i}.l_rate`} render={({ field: f }) => <RowInput numeric value={f.value ? String(f.value) : ''} onChangeText={(v) => f.onChange(v)} />} /></Cell>
            <Cell w={75} align="right"><Controller control={control} name={`items.${i}.e_rate`} render={({ field: f }) => <RowInput numeric value={f.value ? String(f.value) : ''} onChangeText={(v) => f.onChange(v)} />} /></Cell>
            <Cell w={36} align="center">
              <RemoveBtn
                onPress={() => removeItem(i)}
                disabled={itemFields.length === 1}
              />
            </Cell>
          </View>
        ))}
      </View>

      {/* ---- Totals preview ---- */}
      {(() => {
        const total = itemsTotal(watchedItems as any);
        return (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Total Freight</Text>
            <Text style={styles.totalsValue}>{fmt(total)}</Text>
          </View>
        );
      })()}

      <View style={styles.actions}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.cancelBtn}
          accessibilityRole="button"
          testID="bilty-cancel-btn"
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </Pressable>
        <View style={styles.submitWrap}>
          {canSave ? (
            <ButtonPrimary
              title={isEdit ? 'Save changes' : 'Save Bilty'}
              onPress={onSave}
              loading={saving}
              testID="bilty-save-btn"
            />
          ) : (
            <Text style={{ color: colors.danger, fontFamily: typography.uiBold }}>
              You don't have permission to {isEdit ? 'edit' : 'create'} bilties.
            </Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

// -------- Inline components -----------------------------------------------

function SectionBar({ title, onAdd, addLabel, testID }: { title: string; onAdd?: () => void; addLabel: string; testID?: string }) {
  return (
    <View style={styles.sectionBar}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {onAdd ? (
        <Pressable onPress={onAdd} style={styles.addBtn} accessibilityRole="button" testID={testID}>
          <Text style={styles.addBtnText}>{addLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function HeaderCell({ children, w, align = 'left' }: { children: React.ReactNode; w?: number; align?: 'left' | 'right' | 'center' }) {
  return (
    <View style={[styles.cell, w ? { width: w, flexGrow: 0 } : { flex: 1 }, align === 'right' && styles.alignRight, align === 'center' && styles.alignCenter]}>
      <Text style={[styles.headerText, align === 'right' && styles.textRight, align === 'center' && styles.textCenter]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

function Cell({ children, w, align = 'left' }: { children?: React.ReactNode; w?: number; align?: 'left' | 'right' | 'center' }) {
  return (
    <View style={[styles.cell, w ? { width: w, flexGrow: 0 } : { flex: 1 }, align === 'right' && styles.alignRight, align === 'center' && styles.alignCenter]}>
      {children}
    </View>
  );
}

function filterDecimal(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  return parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : cleaned;
}

const filterLetters = (v: string) => v.replace(/[^a-zA-Z\s'.\-]/g, '');
const filterAlphanumeric = (v: string) => v.replace(/[^a-zA-Z0-9\s\-_.\/]/g, '');
const filterDate = (v: string) => v.replace(/[^0-9\-]/g, '').slice(0, 10);

function RowInput({ value, onChangeText, numeric, placeholder, testID, error, filterFn }: {
  value: string; onChangeText: (v: string) => void; numeric?: boolean;
  placeholder?: string; testID?: string; error?: string; filterFn?: (v: string) => string;
}) {
  const [focused, setFocused] = useState(false);
  // Numeric fields: when the stored value is zero, show empty with "0" as a
  // faded placeholder so the user can type without deleting first. Clearing
  // the field stores "0" again so form state always has a valid number.
  const isZeroish =
    numeric && (value === '' || value === '0' || value === '0.0' || Number(value) === 0);
  const display = isZeroish ? '' : value;
  const handleChange = (raw: string) => {
    if (numeric) {
      const filtered = filterDecimal(raw);
      onChangeText(filtered === '' ? '0' : filtered);
    } else if (filterFn) {
      onChangeText(filterFn(raw));
    } else {
      onChangeText(raw);
    }
  };
  return (
    <TextInput
      value={display}
      onChangeText={handleChange}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      keyboardType={numeric ? 'decimal-pad' : 'default'}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      style={[
        styles.rowInput,
        numeric && styles.rowInputRight,
        error ? styles.rowInputError : null,
        focused && styles.rowInputFocused,
        Platform.OS === 'web' && ({ outlineStyle: 'none' } as any),
      ]}
      testID={testID}
    />
  );
}

// Inline cell autocomplete used inside the items table (From, To, Consignee).
// Matches the AutocompleteField look used in Bilty Details. The dropdown is
// position: absolute and flips above the input when there isn't enough room
// below — that's what stops the page from auto-scrolling when the popover
// would otherwise extend past the viewport.
const ROW_DROPDOWN_ITEM_HEIGHT = 32;
const ROW_DROPDOWN_VISIBLE = 5;
const ROW_DROPDOWN_MIN_CHARS = 2;
const ROW_DROPDOWN_WIDTH = 220;

// Lazy-loaded ReactDOM for the web-only portal that renders the dropdown
// directly into document.body. Without this the dropdown can be clipped by
// any ancestor with overflow: hidden (e.g. ScrollView, table cells).
const RowDatalistReactDOM: any = Platform.OS === 'web' ? require('react-dom') : null;
function RowDatalist({
  value,
  onChangeText,
  options,
  filterFn,
  testID,
  placeholder,
}: {
  value: string;
  onChangeText: (v: string) => void;
  options: string[];
  filterFn?: (v: string) => string;
  testID?: string;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [openUp, setOpenUp] = useState(false);
  // Web-only — viewport-relative anchor rect for the body-portal dropdown.
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  const pressingRef = React.useRef(false);
  const inputRef = React.useRef<any>(null);
  // Wrap-level ref — RNW's TextInput ref isn't always a DOM node; the
  // surrounding View reliably is, so we measure that for the portal anchor.
  const wrapRef = React.useRef<any>(null);

  // Filter logic:
  //   - exact-match existing  → show all options (so user can pick another)
  //   - shorter than MIN_CHARS → don't open the list
  //   - 2+ chars              → filter by case-insensitive substring
  const valTrim = value.trim();
  const valLower = valTrim.toLowerCase();
  // Always reflect what's typed (no "show all on exact match") so the list
  // never displays unrelated names once a full value is entered/selected.
  const filtered = valTrim.length >= ROW_DROPDOWN_MIN_CHARS
    ? options.filter((o) => o.toLowerCase().includes(valLower))
    : [];
  const showList = focused && listOpen && filtered.length > 0;

  const handleChange = (raw: string) => {
    const next = filterFn ? filterFn(raw) : raw;
    // Lock: once the cell holds a complete, valid option, block APPENDING more
    // (only backspace / delete may change it). Mirrors AutocompleteField.
    const isCompleteValue = valTrim !== '' && options.some((o) => o.toLowerCase() === valLower);
    const isAppending = next.length > value.length && next.toLowerCase().startsWith(valLower);
    if (isCompleteValue && isAppending) return;
    onChangeText(next);
    setListOpen(true);
  };
  const handleSelect = (opt: string) => {
    onChangeText(opt);
    setListOpen(false);
    pressingRef.current = false;
  };

  // Highlight the currently selected value when the list opens (so the user
  // sees their existing pick first, not always the first row).
  useEffect(() => {
    const idx = filtered.findIndex((o) => o.toLowerCase() === valLower);
    setHighlight(idx >= 0 ? idx : 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length, value]);

  // Decide whether the dropdown should open below or above the input — based
  // on the input's distance to the viewport bottom. Recomputed each time the
  // list is about to open, so we never push the page.
  React.useLayoutEffect(() => {
    if (Platform.OS !== 'web' || !showList) return;
    const measure = () => {
      const node = wrapRef.current as any;
      if (!node || typeof node.getBoundingClientRect !== 'function') return;
      const rect = node.getBoundingClientRect();
      const popoverH = ROW_DROPDOWN_ITEM_HEIGHT * Math.min(filtered.length, ROW_DROPDOWN_VISIBLE) + 8;
      const spaceBelow = window.innerHeight - rect.bottom;
      const up = spaceBelow < popoverH && rect.top > popoverH;
      setOpenUp(up);
      setAnchor({
        top: up ? rect.top - popoverH - 4 : rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, ROW_DROPDOWN_WIDTH),
      });
    };
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [showList, filtered.length]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !showList) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((i) => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const opt = filtered[highlight];
        if (opt) {
          onChangeText(opt);
          setListOpen(false);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setListOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [showList, filtered, highlight, onChangeText]);

  return (
    <View
      ref={wrapRef}
      style={[
        styles.rowAutoWrap,
        showList && Platform.OS === 'web' ? ({ zIndex: 9999 } as any) : null,
      ]}
    >
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        onFocus={() => { setFocused(true); setListOpen(true); }}
        onBlur={() => {
          if (pressingRef.current) return;
          setFocused(false);
          setListOpen(false);
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={[
          styles.rowInput,
          focused && !showList && styles.rowInputFocused,
          showList && (openUp ? styles.rowInputOpenUp : styles.rowInputOpen),
          Platform.OS === 'web' && ({ outlineStyle: 'none', scrollMarginBlock: '120px' } as any),
        ]}
        testID={testID}
      />
      {showList && Platform.OS === 'web' && RowDatalistReactDOM && anchor
        ? RowDatalistReactDOM.createPortal(
            <div
              onMouseDown={(e: any) => e.preventDefault()}
              style={{
                position: 'fixed',
                top: anchor.top,
                left: anchor.left,
                width: anchor.width,
                zIndex: 999999,
                background: '#FFFFFF',
                border: '1px solid #94A3B8',
                borderRadius: 4,
                boxShadow: '0 6px 16px rgba(15,23,42,0.12)',
                maxHeight: ROW_DROPDOWN_ITEM_HEIGHT * ROW_DROPDOWN_VISIBLE,
                overflowY: 'auto',
                boxSizing: 'border-box',
              }}
            >
              {filtered.map((opt, i) => {
                const isHi = i === highlight;
                return (
                  <div
                    key={opt}
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={(e: any) => {
                      e.preventDefault();
                      pressingRef.current = true;
                      handleSelect(opt);
                    }}
                    style={{
                      height: ROW_DROPDOWN_ITEM_HEIGHT,
                      display: 'flex',
                      alignItems: 'center',
                      paddingLeft: 12,
                      paddingRight: 12,
                      cursor: 'pointer',
                      userSelect: 'none',
                      background: isHi ? '#2563EB' : '#FFFFFF',
                      color: isHi ? '#FFFFFF' : '#0F172A',
                      fontSize: 13,
                      lineHeight: '18px',
                      fontFamily: 'inherit',
                      fontWeight: 500,
                    }}
                  >
                    {opt}
                  </div>
                );
              })}
            </div>,
            document.body
          )
        : null}
      {showList && Platform.OS !== 'web' ? (
        <View
          style={[
            styles.rowDropdown,
            openUp ? styles.rowDropdownAbove : styles.rowDropdownBelow,
          ]}
        >
          <ScrollView
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: ROW_DROPDOWN_ITEM_HEIGHT * ROW_DROPDOWN_VISIBLE }}
            showsVerticalScrollIndicator={filtered.length > ROW_DROPDOWN_VISIBLE}
          >
            {filtered.map((opt, i) => (
              <Pressable
                key={opt}
                onPressIn={() => {
                  pressingRef.current = true;
                  setHighlight(i);
                  handleSelect(opt);
                }}
                onPress={() => handleSelect(opt)}
                onPressOut={() => { pressingRef.current = false; }}
                style={({ pressed }) => [
                  styles.rowDropdownItem,
                  i === highlight && styles.rowDropdownItemHighlight,
                  opt === value && styles.rowDropdownItemActive,
                  pressed && styles.rowDropdownItemPressed,
                ]}
                accessibilityRole="menuitem"
              >
                <Text
                  style={[
                    styles.rowDropdownText,
                    opt === value && styles.rowDropdownTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {opt}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function RemoveBtn({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} style={styles.removeBtn}>
      <Text style={[styles.removeBtnText, disabled && styles.removeDisabled]}>×</Text>
    </Pressable>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <View style={[styles.row, styles.emptyRow]}>
      <Text style={styles.emptyText}>{label}</Text>
    </View>
  );
}

function fmt(n: number): string {
  const s = toNum(n).toFixed(2);
  return s.endsWith('.00') ? s.slice(0, -3) : s;
}

// -------- Styles ----------------------------------------------------------

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background },
  centerWrap: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  content: { padding: spacing.md, paddingBottom: spacing.md },
  title: { fontSize: 18, lineHeight: 24, color: colors.text, fontFamily: typography.uiBold, marginBottom: spacing.sm },
  sectionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, marginBottom: spacing.xs },
  sectionTitle: { fontSize: 14, color: colors.text, fontFamily: typography.uiBold },
  sectionError: { color: colors.danger, fontSize: 13, lineHeight: 18, fontFamily: typography.ui, marginBottom: spacing.xs },
  addBtn: { paddingVertical: 4, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary },
  addBtnText: { color: colors.primary, fontFamily: typography.uiBold, fontSize: 13, lineHeight: 18 },
  gridRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs, position: 'relative' as const },
  fieldWide: { flex: 1.5, minWidth: 150 },
  fieldSmall: { flex: 1, minWidth: 100 },
  fieldDate: { width: 140 },
  dateLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 3,
    fontFamily: typography.uiBold,
    letterSpacing: 0.2,
  },
  fieldThird: { flex: 1, minWidth: 140 },
  tableOuter: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card, ...(Platform.OS === 'web' ? ({ overflow: 'visible' } as any) : { overflow: 'hidden' as const }) },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card },
  headerRow: { backgroundColor: colors.background },
  altRow: { backgroundColor: colors.background },
  cell: { paddingHorizontal: 6, paddingVertical: 3, justifyContent: 'center' },
  headerText: { fontSize: 12, lineHeight: 16, color: colors.textMuted, fontFamily: typography.uiBold, textTransform: 'uppercase', letterSpacing: 0.4 },
  alignRight: { alignItems: 'flex-end' },
  alignCenter: { alignItems: 'center' },
  textRight: { textAlign: 'right' },
  textCenter: { textAlign: 'center' },
  rowInput: { width: '100%', height: 30, paddingVertical: 4, paddingHorizontal: 8, fontSize: 13, lineHeight: 18, color: colors.text, fontFamily: typography.uiMedium, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  rowInputRight: { textAlign: 'right', fontFamily: typography.mono },
  rowInputError: { borderColor: colors.danger },
  rowInputFocused: { borderColor: '#94A3B8' },
  rowInputOpen: { borderColor: '#94A3B8' },
  rowInputOpenUp: { borderColor: '#94A3B8' },
  rowAutoWrap: { width: '100%', position: 'relative' as const },
  rowDropdown: {
    position: 'absolute' as const,
    left: 0,
    minWidth: 220,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingVertical: 4,
    overflow: 'hidden',
    zIndex: 99999,
    elevation: 24,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 12px 28px rgba(15,23,42,0.14), 0 4px 10px rgba(15,23,42,0.08)' } as any)
      : {
          shadowColor: '#000',
          shadowOpacity: 0.16,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
        }),
  },
  rowDropdownBelow: {
    top: '100%' as any,
    marginTop: 4,
  },
  rowDropdownAbove: {
    bottom: '100%' as any,
    marginBottom: 4,
  },
  rowDropdownItem: {
    height: 34,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  rowDropdownItemHighlight: { backgroundColor: '#F1F5F9' },
  rowDropdownItemActive: { backgroundColor: colors.brandRedTone },
  rowDropdownItemPressed: { backgroundColor: '#E2E8F0' },
  rowDropdownText: { fontSize: 13, lineHeight: 18, color: colors.text, fontFamily: typography.uiMedium },
  rowDropdownTextActive: { color: colors.brandRed, fontFamily: typography.uiBold },
  removeBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { color: colors.danger, fontSize: 20, fontFamily: typography.uiBold, lineHeight: 22 },
  removeDisabled: { color: colors.textMuted, opacity: 0.4 },
  emptyRow: { padding: spacing.md, justifyContent: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 13, lineHeight: 18, fontFamily: typography.ui },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4 },
  totalsLabel: { color: colors.textMuted, fontSize: 13, lineHeight: 18, fontFamily: typography.ui },
  totalsValue: { color: colors.text, fontSize: 14, lineHeight: 19, fontFamily: typography.mono },
  formError: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.xs },
  formErrorText: { color: colors.danger, fontFamily: typography.ui, fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: spacing.sm, gap: spacing.sm },
  cancelBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  cancelBtnText: { color: colors.textMuted, fontSize: 14, lineHeight: 20, fontFamily: typography.uiBold },
  submitWrap: { minWidth: 140 },
});
