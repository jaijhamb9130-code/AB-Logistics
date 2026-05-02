/**
 * BiltyFormScreen — Phase 4 refactor to React Hook Form + Zod.
 *
 * State is now managed by RHF; validation delegated to CreateBiltySchema.
 * Dynamic tables (items/advances/fuels) use useFieldArray.
 * Save delegates to useBiltyCreate mutation (TanStack Query).
 */

import React, { useEffect, useMemo, useState } from 'react';
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
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ButtonPrimary } from '../components/ButtonPrimary';
import { InputField } from '../components/InputField';
import { Loader } from '../components/Loader';
import { AutocompleteField } from '../components/AutocompleteField';
import { partyLedgerService } from '../services/partyLedgerService';
import { itemMasterService } from '../services/itemMasterService';
import { vehicleMasterService } from '../services/vehicleMasterService';
import { destinationService } from '../services/destinationService';
import { colors, radius, spacing, typography } from '../constants/theme';
import { useBiltyCreate, useBiltyUpdate } from '../hooks/useBiltyUpdate';
import { biltyService } from '../services/biltyService';
import { CreateBiltySchema } from '../../../shared/schemas/bilty.schema';
import type { CreateBiltyInput } from '../../../shared/schemas/bilty.schema';
import { itemsTotal, netPayable, toNum } from '../utils/biltyValidation';
import { getTodayISO } from '../utils/dateUtils';
import type { BiltyStackParamList } from '../navigation/types';

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
  bilty_date: getTodayISO(),
  consignor: '',
  owner_name: '',
  agent_name: '',
  branch: '',
  zone_name: '',
  truck_no: '',
  goods_type: '',
  truck_type: '',
};

const EMPTY_ITEM: CreateBiltyInput['items'][number] = {
  challan_no: '', lr_no: '', from_loc: '', to_loc: '', consignee: '',
  qty: 0, rate: 0, inc_rate: 0, l_rate: 0, e_rate: 0,
};
const EMPTY_ADV: CreateBiltyInput['advances'][number] = {
  adv_date: getTodayISO(), adv_from: '', amount: 0, narration: '',
};
const EMPTY_FUEL: CreateBiltyInput['fuels'][number] = {
  from_loc: '', amount: 0, doc_no: '', doc_date: getTodayISO(),
};

export function BiltyFormScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<BiltyFormRoute>();
  const editingId = route.params?.id ?? null;
  const isEdit = editingId !== null;

  const { mutateAsync: createBilty, isPending: creating } = useBiltyCreate();
  const { mutateAsync: updateBilty, isPending: updating } = useBiltyUpdate(editingId ?? 0);
  const saving = creating || updating;

  const [loading, setLoading] = useState<boolean>(isEdit);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Master data — sourced from Ledger pages. Fetched in parallel on mount;
  // failures are silent (autocomplete just won't have options for that field).
  const [partyOptions, setPartyOptions] = useState<string[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<string[]>([]);
  const [agentOptions, setAgentOptions] = useState<string[]>([]);
  const [itemOptions, setItemOptions] = useState<string[]>([]);
  const [vehicleNoOptions, setVehicleNoOptions] = useState<string[]>([]);
  const [vehicleTypeOptions, setVehicleTypeOptions] = useState<string[]>([]);
  const [branchOptions, setBranchOptions] = useState<string[]>([]);

  useEffect(() => {
    Promise.allSettled([
      partyLedgerService.list(1).then((rs) => setPartyOptions(rs.map((r) => r.name).sort())),
      partyLedgerService.list(2).then((rs) => setOwnerOptions(rs.map((r) => r.name).sort())),
      partyLedgerService.list(3).then((rs) => setAgentOptions(rs.map((r) => r.name).sort())),
      itemMasterService.list().then((rs) => setItemOptions(rs.map((r) => r.name).sort())),

      vehicleMasterService.list().then((rs) => {
        setVehicleNoOptions(rs.map((r) => r.name).sort());
        setVehicleTypeOptions(
          [...new Set(rs.map((r) => r.vehicle_type).filter((v): v is string => Boolean(v)))].sort()
        );
      }),
      destinationService.listBranches().then(setBranchOptions),
    ]);
  }, []);

  // Backwards-compat aliases used by existing JSX below.
  const consignorOptions = partyOptions;
  const ownerNameOptions = ownerOptions;

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CreateBiltyInput>({
    resolver: zodResolver(CreateBiltySchema),
    defaultValues: {
      header: EMPTY_HEADER,
      items: [{ ...EMPTY_ITEM }],
      advances: [{ ...EMPTY_ADV }],
      fuels: [{ ...EMPTY_FUEL }],
    },
  });

  // Set dynamic header title based on mode
  useEffect(() => {
    navigation.setOptions({ title: isEdit ? 'Edit Bilty' : 'New Bilty' });
  }, [navigation, isEdit]);

  // Load existing bilty when editing
  useEffect(() => {
    if (!isEdit || editingId === null) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const detail = await biltyService.get(editingId);
        if (cancelled) return;
        reset({
          header: {
            bilty_date: toDateStr(detail.bilty_date) || getTodayISO(),
            consignor: detail.consignor ?? '',
            owner_name: detail.owner_name ?? '',
            agent_name: detail.agent_name ?? '',
            branch: detail.branch ?? '',
            zone_name: detail.zone_name ?? '',
            truck_no: detail.truck_no ?? '',
            goods_type: detail.goods_type ?? '',
            truck_type: detail.truck_type ?? '',
          },
          items: (detail.items && detail.items.length > 0
            ? detail.items.map((it) => ({
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
              }))
            : [{ ...EMPTY_ITEM }]),
          advances: (detail.advances ?? []).map((a) => ({
            adv_date: toDateStr(a.adv_date) || getTodayISO(),
            adv_from: a.adv_from ?? '',
            amount: toNumStr(a.amount),
            narration: a.narration ?? '',
          })),
          fuels: (detail.fuels ?? []).map((f) => ({
            from_loc: f.from_loc ?? '',
            amount: toNumStr(f.amount),
            doc_no: f.doc_no ?? '',
            doc_date: toDateStr(f.doc_date) || getTodayISO(),
          })),
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
  const { fields: advFields, append: appendAdv, remove: removeAdv } =
    useFieldArray({ control, name: 'advances' });
  const { fields: fuelFields, append: appendFuel, remove: removeFuel } =
    useFieldArray({ control, name: 'fuels' });

  const watchedItems = useWatch({ control, name: 'items' });
  const watchedAdvances = useWatch({ control, name: 'advances' });
  const watchedFuels = useWatch({ control, name: 'fuels' });

  const onSave = handleSubmit(async (data) => {
    try {
      if (isEdit && editingId !== null) {
        await updateBilty(data);
        navigation.navigate('BiltyDetail', { id: editingId });
      } else {
        await createBilty(data);
        navigation.navigate('BiltyList');
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
      <Text style={styles.title}>{isEdit ? 'Edit Bilty' : 'New Bilty'}</Text>

      {formError ? (
        <View style={styles.formError}>
          <Text style={styles.formErrorText}>{formError}</Text>
        </View>
      ) : null}

      {/* ---- Header section ---- */}
      <Text style={styles.sectionTitle}>Bilty Details</Text>

      {/* Row 1: Consignor (wide) · Branch (small) · Date (compact) */}
      <View style={styles.gridRow}>
        <View style={styles.fieldWide}>
          <Controller
            control={control}
            name="header.consignor"
            render={({ field: { value, onChange } }) => (
              <AutocompleteField
                label="Consignor *"
                value={value}
                options={consignorOptions}
                onChangeText={onChange}
                placeholder="Type 3 letters to search..."
                error={errors.header?.consignor?.message ?? null}
                testID="consignor-input"
              />
            )}
          />
        </View>
        <View style={styles.fieldSmall}>
          <Controller
            control={control}
            name="header.branch"
            render={({ field: { value, onChange } }) => (
              <AutocompleteField
                label="Branch"
                value={value ?? ''}
                options={branchOptions}
                onChangeText={onChange}
                placeholder="Type 3 letters..."
              />
            )}
          />
        </View>
        <View style={styles.fieldDate}>
          <Controller
            control={control}
            name="header.bilty_date"
            render={({ field: { value, onChange } }) => (
              <InputField
                label="Date"
                value={value ?? ''}
                onChangeText={onChange}
                fieldType="date"
                placeholder="YYYY-MM-DD"
                testID="bilty-date-input"
              />
            )}
          />
        </View>
      </View>

      {/* Row 2: Truck No · Truck Type · Zone */}
      <View style={styles.gridRow}>
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
                placeholder="Type 3 letters..."
                testID="truck-no-input"
              />
            )}
          />
        </View>
        <View style={styles.fieldThird}>
          <Controller
            control={control}
            name="header.truck_type"
            render={({ field: { value, onChange } }) => (
              <AutocompleteField
                label="Truck Type"
                value={value ?? ''}
                options={vehicleTypeOptions}
                onChangeText={onChange}
                placeholder="Type 3 letters..."
              />
            )}
          />
        </View>
        <View style={styles.fieldThird}>
          <Controller
            control={control}
            name="header.zone_name"
            render={({ field: { value, onChange } }) => (
              <InputField label="Zone" value={value ?? ''} onChangeText={onChange} />
            )}
          />
        </View>
      </View>

      {/* Row 3: Owner Name · Agent Name · Goods Type */}
      <View style={styles.gridRow}>
        <View style={styles.fieldThird}>
          <Controller
            control={control}
            name="header.owner_name"
            render={({ field: { value, onChange } }) => (
              <AutocompleteField
                label="Owner Name"
                value={value ?? ''}
                options={ownerNameOptions}
                onChangeText={onChange}
                placeholder="Type 3 letters to search..."
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
                placeholder="Type 3 letters..."
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
                placeholder="Type 3 letters..."
              />
            )}
          />
        </View>
      </View>

      {/* ---- Items ---- */}
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
          <HeaderCell w={110}>Challan</HeaderCell>
          <HeaderCell w={110}>LR No</HeaderCell>
          <HeaderCell w={110}>From</HeaderCell>
          <HeaderCell w={110}>To</HeaderCell>
          <HeaderCell>Consignee</HeaderCell>
          <HeaderCell w={80} align="right">Qty</HeaderCell>
          <HeaderCell w={90} align="right">Rate</HeaderCell>
          <HeaderCell w={90} align="right">Inc</HeaderCell>
          <HeaderCell w={90} align="right">L-Rate</HeaderCell>
          <HeaderCell w={90} align="right">E-Rate</HeaderCell>
          <HeaderCell w={40}> </HeaderCell>
        </View>
        {itemFields.map((field, i) => (
          <View key={field.id} style={[styles.row, i % 2 === 1 && styles.altRow]}>
            <Cell w={110}><Controller control={control} name={`items.${i}.challan_no`} render={({ field: f }) => <RowInput value={String(f.value ?? '')} onChangeText={f.onChange} filterFn={filterAlphanumeric} />} /></Cell>
            <Cell w={110}><Controller control={control} name={`items.${i}.lr_no`} render={({ field: f }) => <RowInput value={String(f.value ?? '')} onChangeText={f.onChange} filterFn={filterAlphanumeric} />} /></Cell>
            <Cell w={110}><Controller control={control} name={`items.${i}.from_loc`} render={({ field: f }) => <RowInput value={String(f.value ?? '')} onChangeText={f.onChange} filterFn={filterLetters} />} /></Cell>
            <Cell w={110}><Controller control={control} name={`items.${i}.to_loc`} render={({ field: f }) => <RowInput value={String(f.value ?? '')} onChangeText={f.onChange} filterFn={filterLetters} />} /></Cell>
            <Cell><Controller control={control} name={`items.${i}.consignee`} render={({ field: f }) => <RowInput value={String(f.value ?? '')} onChangeText={f.onChange} filterFn={filterLetters} />} /></Cell>
            <Cell w={80} align="right">
              <Controller control={control} name={`items.${i}.qty`} render={({ field: f }) => (
                <RowInput numeric value={String(f.value ?? '')} onChangeText={(v) => f.onChange(v)} testID={`item-qty-${i}`} error={errors.items?.[i]?.qty?.message} />
              )} />
            </Cell>
            <Cell w={90} align="right">
              <Controller control={control} name={`items.${i}.rate`} render={({ field: f }) => (
                <RowInput numeric value={String(f.value ?? '')} onChangeText={(v) => f.onChange(v)} testID={`item-rate-${i}`} error={errors.items?.[i]?.rate?.message} />
              )} />
            </Cell>
            <Cell w={90} align="right"><Controller control={control} name={`items.${i}.inc_rate`} render={({ field: f }) => <RowInput numeric value={String(f.value ?? '')} onChangeText={(v) => f.onChange(v)} />} /></Cell>
            <Cell w={90} align="right"><Controller control={control} name={`items.${i}.l_rate`} render={({ field: f }) => <RowInput numeric value={String(f.value ?? '')} onChangeText={(v) => f.onChange(v)} />} /></Cell>
            <Cell w={90} align="right"><Controller control={control} name={`items.${i}.e_rate`} render={({ field: f }) => <RowInput numeric value={String(f.value ?? '')} onChangeText={(v) => f.onChange(v)} />} /></Cell>
            <Cell w={40} align="center">
              <RemoveBtn onPress={() => removeItem(i)} disabled={itemFields.length === 1} />
            </Cell>
          </View>
        ))}
      </View>

      {/* ---- Advances ---- */}
      <SectionBar title="Advance Details" onAdd={() => appendAdv({ ...EMPTY_ADV })} addLabel="+ Add advance" testID="add-advance-btn" />
      <View style={styles.tableOuter}>
        <View style={[styles.row, styles.headerRow]}>
          <HeaderCell w={130}>Date</HeaderCell>
          <HeaderCell w={150}>From</HeaderCell>
          <HeaderCell w={120} align="right">Amount</HeaderCell>
          <HeaderCell>Narration</HeaderCell>
          <HeaderCell w={40}> </HeaderCell>
        </View>
        {advFields.length === 0 ? (
          <EmptyRow label="No advance rows." />
        ) : advFields.map((field, i) => (
          <View key={field.id} style={[styles.row, i % 2 === 1 && styles.altRow]}>
            <Cell w={130}><Controller control={control} name={`advances.${i}.adv_date`} render={({ field: f }) => <RowInput placeholder="YYYY-MM-DD" value={String(f.value ?? '')} onChangeText={f.onChange} filterFn={filterDate} />} /></Cell>
            <Cell w={150}><Controller control={control} name={`advances.${i}.adv_from`} render={({ field: f }) => <RowInput value={String(f.value ?? '')} onChangeText={f.onChange} filterFn={filterLetters} />} /></Cell>
            <Cell w={120} align="right"><Controller control={control} name={`advances.${i}.amount`} render={({ field: f }) => <RowInput numeric value={String(f.value ?? '')} onChangeText={(v) => f.onChange(v)} />} /></Cell>
            <Cell><Controller control={control} name={`advances.${i}.narration`} render={({ field: f }) => <RowInput value={String(f.value ?? '')} onChangeText={f.onChange} />} /></Cell>
            <Cell w={40} align="center"><RemoveBtn onPress={() => removeAdv(i)} /></Cell>
          </View>
        ))}
      </View>

      {/* ---- Fuel ---- */}
      <SectionBar title="Fuel Details" onAdd={() => appendFuel({ ...EMPTY_FUEL })} addLabel="+ Add fuel" testID="add-fuel-btn" />
      <View style={styles.tableOuter}>
        <View style={[styles.row, styles.headerRow]}>
          <HeaderCell w={150}>From</HeaderCell>
          <HeaderCell w={120} align="right">Amount</HeaderCell>
          <HeaderCell w={140}>Doc No</HeaderCell>
          <HeaderCell w={140}>Doc Date</HeaderCell>
          <HeaderCell> </HeaderCell>
          <HeaderCell w={40}> </HeaderCell>
        </View>
        {fuelFields.length === 0 ? (
          <EmptyRow label="No fuel rows." />
        ) : fuelFields.map((field, i) => (
          <View key={field.id} style={[styles.row, i % 2 === 1 && styles.altRow]}>
            <Cell w={150}><Controller control={control} name={`fuels.${i}.from_loc`} render={({ field: f }) => <RowInput value={String(f.value ?? '')} onChangeText={f.onChange} filterFn={filterLetters} />} /></Cell>
            <Cell w={120} align="right"><Controller control={control} name={`fuels.${i}.amount`} render={({ field: f }) => <RowInput numeric value={String(f.value ?? '')} onChangeText={(v) => f.onChange(v)} />} /></Cell>
            <Cell w={140}><Controller control={control} name={`fuels.${i}.doc_no`} render={({ field: f }) => <RowInput value={String(f.value ?? '')} onChangeText={f.onChange} filterFn={filterAlphanumeric} />} /></Cell>
            <Cell w={140}><Controller control={control} name={`fuels.${i}.doc_date`} render={({ field: f }) => <RowInput placeholder="YYYY-MM-DD" value={String(f.value ?? '')} onChangeText={f.onChange} filterFn={filterDate} />} /></Cell>
            <Cell />
            <Cell w={40} align="center"><RemoveBtn onPress={() => removeFuel(i)} /></Cell>
          </View>
        ))}
      </View>

      {/* ---- Totals preview ---- */}
      <View style={styles.totalsRow}>
        <Text style={styles.totalsLabel}>Freight Total</Text>
        <Text style={styles.totalsValue}>{fmt(itemsTotal(watchedItems as any))}</Text>
      </View>
      <View style={styles.totalsRow}>
        <Text style={styles.totalsLabel}>Net Payable (preview)</Text>
        <Text style={styles.totalsValue}>{fmt(netPayable(watchedItems as any, watchedAdvances as any, watchedFuels as any))}</Text>
      </View>

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
          <ButtonPrimary
            title={isEdit ? 'Save changes' : 'Save Bilty'}
            onPress={onSave}
            loading={saving}
            testID="bilty-save-btn"
          />
        </View>
      </View>
    </ScrollView>
  );
}

// -------- Inline components -----------------------------------------------

function SectionBar({ title, onAdd, addLabel, testID }: { title: string; onAdd: () => void; addLabel: string; testID?: string }) {
  return (
    <View style={styles.sectionBar}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Pressable onPress={onAdd} style={styles.addBtn} accessibilityRole="button" testID={testID}>
        <Text style={styles.addBtnText}>{addLabel}</Text>
      </Pressable>
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
  const handleChange = (raw: string) => {
    if (numeric) onChangeText(filterDecimal(raw));
    else if (filterFn) onChangeText(filterFn(raw));
    else onChangeText(raw);
  };
  return (
    <TextInput
      value={value}
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
  return toNum(n).toFixed(2);
}

// -------- Styles ----------------------------------------------------------

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background },
  centerWrap: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: 24, lineHeight: 32, color: colors.text, fontFamily: typography.uiBold, marginBottom: spacing.lg },
  sectionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 16, color: colors.text, fontFamily: typography.uiBold },
  sectionError: { color: colors.danger, fontSize: 13, lineHeight: 18, fontFamily: typography.ui, marginBottom: spacing.sm },
  addBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.primary },
  addBtnText: { color: colors.primary, fontFamily: typography.uiBold, fontSize: 14, lineHeight: 20 },
  gridRow: { flexDirection: 'row', gap: spacing.md, marginBottom: 0 },
  fieldWide: { flex: 1.5, minWidth: 150 },
  fieldSmall: { flex: 1, minWidth: 100 },
  fieldDate: { width: 140 },
  fieldThird: { flex: 1, minWidth: 140 },
  tableOuter: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.card },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card },
  headerRow: { backgroundColor: colors.background },
  altRow: { backgroundColor: colors.background },
  cell: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, justifyContent: 'center' },
  headerText: { fontSize: 13, lineHeight: 18, color: colors.textMuted, fontFamily: typography.uiBold, textTransform: 'uppercase', letterSpacing: 0.5 },
  alignRight: { alignItems: 'flex-end' },
  alignCenter: { alignItems: 'center' },
  textRight: { textAlign: 'right' },
  textCenter: { textAlign: 'center' },
  rowInput: { width: '100%', paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, fontSize: 14, lineHeight: 20, color: colors.text, fontFamily: typography.ui, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  rowInputRight: { textAlign: 'right', fontFamily: typography.mono },
  rowInputError: { borderColor: colors.danger },
  rowInputFocused: { borderColor: colors.brandRed, borderWidth: 2 },
  removeBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  removeBtnText: { color: colors.danger, fontSize: 20, fontFamily: typography.uiBold, lineHeight: 22 },
  removeDisabled: { color: colors.textMuted, opacity: 0.4 },
  emptyRow: { padding: spacing.md, justifyContent: 'center' },
  emptyText: { color: colors.textMuted, fontSize: 13, lineHeight: 18, fontFamily: typography.ui },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm },
  totalsLabel: { color: colors.textMuted, fontSize: 14, lineHeight: 20, fontFamily: typography.ui },
  totalsValue: { color: colors.text, fontSize: 15, lineHeight: 21, fontFamily: typography.mono },
  formError: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  formErrorText: { color: colors.danger, fontFamily: typography.ui, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: spacing.xl, gap: spacing.md },
  cancelBtn: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  cancelBtnText: { color: colors.textMuted, fontSize: 15, lineHeight: 21, fontFamily: typography.uiBold },
  submitWrap: { minWidth: 160 },
});
