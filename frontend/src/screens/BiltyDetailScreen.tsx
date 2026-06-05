/**
 * BiltyDetailScreen — read-only view of a saved bilty (Phase 3).
 * Renders header + items + totals (computed client-side).
 */

import React, { useCallback, useEffect, useState } from 'react';
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
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { DataTable, type Column } from '../components/DataTable';
import { Loader } from '../components/Loader';
import { colors, radius, spacing, typography } from '../constants/theme';
import { biltyService } from '../services/biltyService';
import { freightService } from '../services/freightService';
import { CommonActions } from '@react-navigation/native';
import {
  itemsTotal,
  netPayable,
  toNum,
} from '../utils/biltyValidation';
import type {
  BiltyDetail,
  BiltyItem,
} from '../../../shared/types/bilty';
import type { BiltyStackParamList } from '../navigation/types';
import { useResponsive } from '../hooks/useResponsive';
import { ButtonPrimary } from '../components/ButtonPrimary';
import { Step2Items } from './MobileBiltyFormScreen';
import { useBiltyUpdate } from '../hooks/useBiltyUpdate';
import type { CreateBiltyInput } from '../../../shared/schemas/bilty.schema';
import { getTodayISO } from '../utils/dateUtils';
import { ledgerMasterService } from '../services/ledgerMasterService';
import { destinationService } from '../services/destinationService';
import { useAuth } from '../context/AuthContext';
import { canDoAction } from '../navigation/guards';
import { Alert } from 'react-native';

type Nav = NativeStackNavigationProp<BiltyStackParamList, 'BiltyDetail'>;
type Rt = RouteProp<BiltyStackParamList, 'BiltyDetail'>;

export function BiltyDetailScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const { id } = route.params;
  const { isMobile } = useResponsive();
  const [data, setData] = useState<BiltyDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [memoErr, setMemoErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      navigation.navigate('BiltyList');
      return;
    }
    setErr(null);
    try {
      const d = await biltyService.get(id);
      setData(d);
    } catch (_e) {
      setErr('Could not load bilty.');
    }
  }, [id, navigation]);

  useEffect(() => { load(); }, [load]);

  // Hide the navigation header on mobile — the mobile preview renders its own top bar.
  useEffect(() => {
    navigation.setOptions({ headerShown: !isMobile });
  }, [navigation, isMobile]);

  // Permissions for the action buttons in the detail header. Bilties ARE
  // vouchers, so voucher.* perms count as a fallback for users who only have
  // daybook-level access.
  const canEdit =
    canDoAction(user, 'bilty', 'edit') || canDoAction(user, 'voucher', 'edit');
  const canDelete =
    canDoAction(user, 'bilty', 'delete') || canDoAction(user, 'voucher', 'delete');
  const [deleting, setDeleting] = useState(false);

  const onDelete = useCallback(async () => {
    const ok =
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm(`Delete bilty ${data?.bilty_no}? This cannot be undone.`)
        : true;
    if (!ok) return;
    setDeleting(true);
    try {
      await biltyService.delete(id);
      navigation.navigate('BiltyList');
    } catch (e: any) {
      const code = e?.response?.data?.error;
      const message =
        code === 'in_use'
          ? 'Cannot delete — bilty is still referenced by a freight memo or voucher.'
          : 'Could not delete bilty. Try again.';
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(message);
      } else {
        Alert.alert('Delete failed', message);
      }
    } finally {
      setDeleting(false);
    }
  }, [data?.bilty_no, id, navigation]);

  /**
   * Phase 4 — generate (or jump to existing) freight memo for this bilty.
   * CLAUDE.md rule honored: memo is derived — this button is the ONLY entry
   * point from the bilty side. 409 means a memo already exists → we route to
   * the existing memo so the action is idempotent UX.
   */
  const generateMemo = useCallback(async () => {
    if (generating) return;
    setMemoErr(null);
    setGenerating(true);
    try {
      const memo = await freightService.generate(id);
      navigation.dispatch(
        CommonActions.navigate({
          name: 'Freight',
          params: { screen: 'FreightDetail', params: { id: memo.id } },
        })
      );
    } catch (e: any) {
      const code = e?.response?.status;
      if (code === 409) {
        try {
          const existing = await freightService.getByBiltyId(id);
          navigation.dispatch(
            CommonActions.navigate({
              name: 'Freight',
              params: { screen: 'FreightDetail', params: { id: existing.id } },
            })
          );
          return;
        } catch {
          setMemoErr('A freight memo already exists for this bilty.');
        }
      } else if (code === 403) {
        setMemoErr('You are not permitted to generate freight memos.');
      } else if (code === 404) {
        setMemoErr('Bilty not found.');
      } else {
        setMemoErr('Could not generate freight memo. Try again.');
      }
    } finally {
      setGenerating(false);
    }
  }, [generating, id, navigation]);

  if (err) {
    return (
      <View style={styles.wrap}>
        <View style={styles.errorWrap}>
          <Text style={styles.title}>Bilty</Text>
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{err}</Text>
          </View>
          <Pressable
            onPress={() => navigation.navigate('BiltyList')}
            style={styles.backBtn}
            accessibilityRole="button"
          >
            <Text style={styles.backBtnText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const canRead = canDoAction(user, 'bilty', 'view');
  if (!canRead) {
    return (
      <View style={styles.wrap}>
        <View style={styles.errorWrap}>
          <Text style={styles.title}>Bilty</Text>
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>You don't have permission to view this bilty.</Text>
          </View>
        </View>
      </View>
    );
  }

  if (!data) return <Loader />;

  // Mobile (<768px): render printable-style preview with Edit button at top.
  if (isMobile) {
    return (
      <MobileBiltyPreviewView
        data={data}
        onEdit={() => navigation.navigate('BiltyForm', { id: data.id })}
        onBack={() => navigation.navigate('BiltyList')}
        onSaved={load}
      />
    );
  }

  const itemCols: Column<BiltyItem>[] = [
    { key: 'challan_no', label: 'Challan', width: 100, render: (r) => r.challan_no ?? '—' },
    { key: 'lr_no', label: 'LR No', width: 100, render: (r) => r.lr_no ?? '—' },
    { key: 'shipment_no' as any, label: 'Shipment No', width: 120, render: (r) => (r as any).shipment_no ?? '—' },
    { key: 'from_loc', label: 'From', width: 110, render: (r) => r.from_loc ?? '—' },
    { key: 'to_loc', label: 'To', width: 110, render: (r) => r.to_loc ?? '—' },
    { key: 'consignee', label: 'Consignee', render: (r) => r.consignee ?? '—' },
    { key: 'qty', label: 'Qty', width: 70, align: 'right', render: (r) => fmt(r.qty) },
    { key: 'rate', label: 'Rate', width: 80, align: 'right', render: (r) => fmt(r.rate) },
    { key: 'inc_rate' as any, label: 'Inc', width: 70, align: 'right', render: (r) => fmt((r as any).inc_rate) },
    { key: 'l_rate' as any, label: 'L-Rate', width: 80, align: 'right', render: (r) => fmt((r as any).l_rate) },
    { key: 'e_rate' as any, label: 'E-Rate', width: 80, align: 'right', render: (r) => fmt((r as any).e_rate) },
    {
      key: 'amount', label: 'Amount', width: 100, align: 'right',
      render: (r) => fmt(toNum(r.qty) * toNum(r.rate))
    },
  ];

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{data.bilty_no}</Text>
          <Text style={styles.subtitle}>
            {shortDate(data.bilty_date)} · {data.consignor} · {data.truck_no}
          </Text>
        </View>
        <View style={styles.headerBtns}>
          <Pressable
            onPress={generateMemo}
            disabled={generating}
            style={[styles.backBtn, styles.memoBtn, generating && styles.memoBtnDisabled]}
            accessibilityRole="button"
            testID="generate-memo-btn"
          >
            <Text style={[styles.backBtnText, styles.memoBtnText]}>
              {generating ? 'Generating…' : 'Generate Freight Memo'}
            </Text>
          </Pressable>
          {canEdit ? (
            <Pressable
              onPress={() => navigation.navigate('BiltyForm', { id: data.id })}
              style={[styles.backBtn, styles.editBtn]}
              accessibilityRole="button"
              testID="edit-btn"
            >
              <Text style={[styles.backBtnText, styles.editBtnText]}>Edit</Text>
            </Pressable>
          ) : null}
          {canDelete ? (
            <Pressable
              onPress={onDelete}
              disabled={deleting}
              style={[styles.backBtn, styles.deleteBtn, deleting && styles.memoBtnDisabled]}
              accessibilityRole="button"
              testID="delete-btn"
            >
              <Text style={[styles.backBtnText, styles.deleteBtnText]}>
                {deleting ? 'Deleting…' : 'Delete'}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            accessibilityRole="button"
          >
            <Text style={styles.backBtnText}>Back</Text>
          </Pressable>
        </View>
      </View>

      {memoErr ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{memoErr}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Details</Text>
        <View style={styles.grid}>
          <KV label="Bill To" value={(data as any).bill_to ?? null} />
          <KV label="GST No" value={(data as any).gst_no ?? null} mono />
          <KV label="Owner" value={data.owner_name} />
          <KV label="Agent" value={data.agent_name} />
          <KV label="Branch" value={data.branch} />
          <KV label="Goods Type" value={data.goods_type} />
        </View>
      </View>

      <Text style={styles.sectionTitle}>Items</Text>
      <View style={styles.tableWrap}>
        <DataTable<BiltyItem>
          columns={itemCols}
          rows={data.items || []}
          keyExtractor={(r) => r.id ?? Math.random()}
          stickyHeader={false}
          emptyLabel="No items."
        />
      </View>

      {/* Totals strip — Freight subtotal on the left, prominent Net Payable on the right. */}
      <View style={styles.totalsStrip}>
        <View style={styles.totalsCells}>
          <View style={styles.totalCell}>
            <Text style={styles.totalCellLabel}>Freight</Text>
            <Text style={styles.totalCellValue}>{fmt(itemsTotal(data.items))}</Text>
          </View>
        </View>
        <View style={styles.netPayableBox}>
          <Text style={styles.netPayableLabel}>NET PAYABLE</Text>
          <Text style={styles.netPayableValue}>
            {fmt(netPayable(data.items))}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function KV({
  label,
  value,
  mono,
  strong,
}: {
  label: string;
  value: string | null | undefined | number;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text
        style={[
          styles.kvValue,
          mono && { fontFamily: typography.mono },
          strong && { fontFamily: typography.uiBold, color: colors.text },
        ]}
      >
        {value !== null && value !== undefined && value !== '' ? String(value) : '—'}
      </Text>
    </View>
  );
}

// ─── Mobile preview view (read-only + in-place edit) ─────────────────────────
function MobileBiltyPreviewView({
  data,
  onEdit,
  onBack,
  onSaved,
}: {
  data: BiltyDetail;
  onEdit: () => void;
  onBack: () => void;
  onSaved: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { mutateAsync: updateBilty, isPending: saving } = useBiltyUpdate(data.id);

  // Master data — needed for the in-place edit autocompletes (consignor /
  // bill_to / consignee from ledger_master, from/to from destination_master).
  const [partyOptions, setPartyOptions] = useState<string[]>([]);
  const [destinationOptions, setDestinationOptions] = useState<string[]>([]);
  useEffect(() => {
    if (!isEditing) return;
    Promise.allSettled([
      // Pull every ledger so the consignor / bill-to autocomplete matches
      // the unified Ledger Master view; avoids hardcoding the party group id.
      ledgerMasterService.list(null).then((rs) => setPartyOptions(rs.map((r) => r.name).sort())),
      destinationService.list().then((rs) =>
        setDestinationOptions(
          [...new Set(rs.map((r) => r.name).filter((v): v is string => Boolean(v)))].sort()
        )
      ),
    ]);
  }, [isEditing]);

  const { control, getValues, setValue, reset } = useForm<CreateBiltyInput>({
    defaultValues: dataToFormValues(data),
  });
  const itemArr = useFieldArray({ control, name: 'items' });

  // Live values during edit so totals update as the user types.
  const watchedItems = useWatch({ control, name: 'items' });

  // Re-seed form whenever fresh data arrives (after a save reload).
  useEffect(() => {
    reset(dataToFormValues(data));
  }, [data, reset]);

  const startEdit = () => {
    setSaveError(null);
    reset(dataToFormValues(data));
    setIsEditing(true);
  };
  const cancelEdit = () => {
    reset(dataToFormValues(data));
    setSaveError(null);
    setIsEditing(false);
  };
  const saveChanges = async () => {
    setSaveError(null);
    try {
      const values = getValues();
      await updateBilty(values as any);
      setIsEditing(false);
      onSaved();
    } catch (e: any) {
      setSaveError(
        e?.response?.data?.error?.message ?? e?.message ?? 'Save failed. Please try again.'
      );
    }
  };

  // Totals data source: live form values during edit, persisted data otherwise.
  const itemsForTotals: any[] = isEditing ? (watchedItems as any[]) ?? [] : data.items ?? [];

  return (
    <View style={mStyles.shell}>
      {/* Top bar — upper Edit button untouched per request */}
      <View style={mStyles.topBar}>
        <Pressable onPress={onBack} hitSlop={8} style={mStyles.iconBtn} accessibilityLabel="Back">
          <Text style={mStyles.iconBtnText}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={mStyles.topTitle}>{data.bilty_no}</Text>
          <Text style={mStyles.topSubtitle}>{isEditing ? 'Editing Bilty' : 'Bilty Preview'}</Text>
        </View>
        <Pressable onPress={onEdit} style={mStyles.editBtn} accessibilityRole="button" accessibilityLabel="Edit bilty">
          <Text style={mStyles.editBtnText}>✎ Edit</Text>
        </Pressable>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={mStyles.scrollContent}>
        <View style={mStyles.sheet}>
          <View style={mStyles.sheetHeader}>
            <Text style={mStyles.brand}>AB LOGISTICS</Text>
            <Text style={mStyles.docLabel}>BILTY</Text>
          </View>

          {/* BILTY DETAILS — read-only matches form Step 1 layout (no 3-col grid) */}
          <PSection title="BILTY DETAILS">
            {isEditing ? (
              <BiltyHeaderEdit control={control} biltyNo={data.bilty_no} />
            ) : (
              <>
                <MKV label="Bilty No" value={data.bilty_no} bold />
                <MKV label="Date" value={shortDate(data.bilty_date)} />
                <MKV label="Consignor" value={data.consignor || '—'} />
                <MKV label="Owner" value={data.owner_name || '—'} />
                <MKV label="Agent" value={data.agent_name || '—'} />
                <MKV label="Truck No" value={data.truck_no || '—'} />
                <MKV label="Bill To" value={data.bill_to || '—'} />
                <View style={mStyles.mkvHalfRow}>
                  <View style={mStyles.mkvHalf}>
                    <Text style={mStyles.mkvLabel}>Branch</Text>
                    <Text style={[mStyles.mkvValue, mStyles.mkvValueLeft]} numberOfLines={1}>
                      {data.branch || '—'}
                    </Text>
                  </View>
                  <View style={[mStyles.mkvHalf, mStyles.mkvHalfRight]}>
                    <Text style={mStyles.mkvLabel}>Goods Type</Text>
                    <Text style={mStyles.mkvValue} numberOfLines={1}>
                      {data.goods_type || '—'}
                    </Text>
                  </View>
                </View>
              </>
            )}
          </PSection>

          {/* ITEMS — in edit mode use the wizard's modal-card editor */}
          {isEditing ? (
            <Step2Items
              control={control}
              errors={{}}
              itemArr={itemArr}
              getValues={getValues}
              setValue={setValue}
              consignorOptions={partyOptions}
              destinationOptions={destinationOptions}
            />
          ) : (
            <PSection title="ITEMS">
              {(data.items || []).length === 0 ? (
                <Text style={mStyles.muted}>No items.</Text>
              ) : (
                data.items.map((it, i) => (
                  <View key={it.id ?? i} style={mStyles.itemCard}>
                    <Text style={mStyles.itemTitle}>ITEM {i + 1}</Text>
                    {/* Row 1 — Challan No · LR No */}
                    <View style={mStyles.gridRow}>
                      <MCell label="CHALLAN NO" value={it.challan_no || '—'} />
                      <MCell label="LR NO" value={it.lr_no || '—'} />
                    </View>
                    {/* Row 2 — From · To */}
                    <View style={mStyles.gridRow}>
                      <MCell label="FROM" value={it.from_loc || '—'} />
                      <MCell label="TO" value={it.to_loc || '—'} />
                    </View>
                    {/* Row 3 — Consignee · Shipment No */}
                    <View style={mStyles.gridRow}>
                      <MCell label="CONSIGNEE" value={it.consignee || '—'} />
                      <MCell label="SHIPMENT NO" value={(it as any).shipment_no || '—'} />
                    </View>
                    {/* Row 4 — Qty · Rate · Inc · L-Rate · E-Rate (all 5 on one line) */}
                    <View style={mStyles.gridRow}>
                      <MCell label="QTY" value={fmt(it.qty)} num />
                      <MCell label="RATE" value={fmt(it.rate)} num />
                      <MCell label="INC" value={fmt(it.inc_rate)} num />
                      <MCell label="L-RATE" value={fmt(it.l_rate)} num />
                      <MCell label="E-RATE" value={fmt(it.e_rate)} num />
                    </View>
                    {/* Row 5 — Line Total (full width, bold) */}
                    <View style={mStyles.gridRow}>
                      <MCell label="LINE TOTAL" value={fmt(toNum(it.qty) * toNum(it.rate))} num bold />
                    </View>
                  </View>
                ))
              )}
            </PSection>
          )}

          {/* Totals — recompute live during edit so user sees impact */}
          <View style={mStyles.totalsBox}>
            <View style={mStyles.gridRow}>
              <MCell label="Freight" value={fmt(itemsTotal(itemsForTotals))} num />
            </View>
            <View style={[mStyles.gridRow, { marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(247,72,61,0.2)' }]}>
              <View style={[mStyles.cellWrap, { flex: 3 }]}>
                <Text style={mStyles.cellLabel}>Net Payable</Text>
                <Text style={[mStyles.cellValue, { fontFamily: typography.uiHeavy, color: colors.brandRed, fontSize: 16 }]}>
                  {fmt(netPayable(itemsForTotals))}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {saveError ? (
          <Text style={mStyles.saveError}>{saveError}</Text>
        ) : null}

        {/* Bottom action — "Edit Bilty" toggles edit mode in place. */}
        <View style={{ marginTop: spacing.md }}>
          {isEditing ? (
            <View style={mStyles.editActions}>
              <Pressable onPress={cancelEdit} style={mStyles.cancelBtn} accessibilityRole="button" disabled={saving}>
                <Text style={mStyles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <ButtonPrimary title="✓ Save Changes" onPress={saveChanges} loading={saving} />
              </View>
            </View>
          ) : (
            <ButtonPrimary title="✎ Edit Bilty" onPress={startEdit} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Editable BILTY DETAILS section (used inside MobileBiltyPreviewView) ─────
function BiltyHeaderEdit({ control }: { control: any; biltyNo?: string }) {
  return (
    <View>
      <View style={mStyles.gridRow}>
        <EditCell control={control} name="header.bilty_no" label="Bilty No" />
        <EditCell control={control} name="header.bilty_date" label="Date" />
        <EditCell control={control} name="header.branch" label="Branch" />
      </View>
      <View style={mStyles.gridRow}>
        <EditCell control={control} name="header.consignor" label="Consignor" />
        <EditCell control={control} name="header.bill_to" label="Bill To" />
        <EditCell control={control} name="header.truck_no" label="Truck No" />
      </View>
      <View style={mStyles.gridRow}>
        <EditCell control={control} name="header.goods_type" label="Goods Type" />
        <View style={mStyles.cellWrap} />
      </View>
      <View style={mStyles.gridRow}>
        <EditCell control={control} name="header.owner_name" label="Owner" />
        <EditCell control={control} name="header.agent_name" label="Agent" />
        <View style={mStyles.cellWrap} />
      </View>
    </View>
  );
}

// Compact KV row for the mobile read-only preview — label left, value right.
function MKV({
  label,
  value,
  num,
  bold,
}: {
  label: string;
  value: string | number | null | undefined;
  num?: boolean;
  bold?: boolean;
}) {
  const v = value === null || value === undefined || value === '' ? '—' : String(value);
  return (
    <View style={mStyles.mkvRow}>
      <Text style={mStyles.mkvLabel}>{label}</Text>
      <Text
        style={[
          mStyles.mkvValue,
          num && mStyles.cellValueNum,
          bold && mStyles.cellValueBold,
        ]}
        numberOfLines={1}
      >
        {v}
      </Text>
    </View>
  );
}

function EditCell({ control, name, label }: { control: any; name: string; label: string }) {
  return (
    <View style={mStyles.cellWrap}>
      <Text style={mStyles.cellLabel}>{label}</Text>
      <Controller
        control={control}
        name={name as any}
        render={({ field: { value, onChange } }) => (
          <TextInput
            value={value ?? ''}
            onChangeText={onChange}
            style={mStyles.editInput}
            placeholderTextColor={colors.textMuted}
          />
        )}
      />
    </View>
  );
}

// Map BiltyDetail (API response) to the form's CreateBiltyInput shape so
// react-hook-form can drive both the read-only view and the in-place editor.
function dataToFormValues(data: BiltyDetail): CreateBiltyInput {
  return {
    header: {
      bilty_no: data.bilty_no ?? '',
      bilty_date: shortDate(data.bilty_date) || getTodayISO(),
      consignor: data.consignor ?? '',
      bill_to: data.bill_to ?? '',
      owner_name: data.owner_name ?? '',
      agent_name: data.agent_name ?? '',
      branch: data.branch ?? '',
      truck_no: data.truck_no ?? '',
      goods_type: data.goods_type ?? '',
    } as any,
    items: (data.items ?? []).map((it: any) => ({
      challan_no: it.challan_no ?? '',
      lr_no: it.lr_no ?? '',
      from_loc: it.from_loc ?? '',
      to_loc: it.to_loc ?? '',
      consignee: it.consignee ?? '',
      qty: Number(it.qty) || 0,
      rate: Number(it.rate) || 0,
      inc_rate: Number(it.inc_rate) || 0,
      l_rate: Number(it.l_rate) || 0,
      e_rate: Number(it.e_rate) || 0,
      shipment_no: it.shipment_no ?? '',
    })) as any,
  } as CreateBiltyInput;
}

function PSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={mStyles.section}>
      <Text style={mStyles.sectionLabel}>{title}</Text>
      {children}
    </View>
  );
}

function PKV({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={mStyles.kvRow}>
      <Text style={mStyles.kvLabel}>{label}</Text>
      <Text style={[mStyles.kvValue, bold && { fontFamily: typography.uiBold, color: colors.textStrong }]}>{value}</Text>
    </View>
  );
}

// Single grid cell — label above value, takes 1/3 of row width.
function MCell({ label, value, num, bold }: { label?: string; value?: string; num?: boolean; bold?: boolean }) {
  return (
    <View style={mStyles.cellWrap}>
      {label ? <Text style={mStyles.cellLabel}>{label}</Text> : null}
      {value !== undefined ? (
        <Text
          style={[
            mStyles.cellValue,
            num && mStyles.cellValueNum,
            bold && mStyles.cellValueBold,
          ]}
          numberOfLines={1}
        >
          {value}
        </Text>
      ) : null}
    </View>
  );
}

function fmt(n: unknown): string {
  const s = toNum(n).toFixed(2);
  return s.endsWith('.00') ? s.slice(0, -3) : s;
}

function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
    return d.toISOString().slice(0, 10);
  } catch {
    return String(iso).slice(0, 10);
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontSize: 22, color: colors.text, fontFamily: typography.uiBold },
  subtitle: { fontSize: 13, color: colors.textMuted, fontFamily: typography.ui, marginTop: 2 },
  backBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backBtnText: {
    color: colors.text,
    fontFamily: typography.uiBold,
    fontSize: 14,
  },
  headerBtns: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  memoBtn: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  memoBtnDisabled: {
    opacity: 0.6,
  },
  memoBtnText: {
    color: colors.card,
  },
  editBtn: {
    borderColor: '#2563EB',
    backgroundColor: '#2563EB',
  },
  editBtnText: {
    color: '#FFFFFF',
  },
  deleteBtn: {
    borderColor: colors.danger,
    backgroundColor: colors.danger,
  },
  deleteBtnText: {
    color: '#FFFFFF',
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 14,
    color: colors.text,
    fontFamily: typography.uiBold,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.sm },
  kv: { minWidth: 140 },
  kvLabel: { fontSize: 11, color: colors.textMuted, fontFamily: typography.uiBold, letterSpacing: 0.3 },
  kvValue: { fontSize: 14, color: colors.text, fontFamily: typography.ui, marginTop: 1 },
  tableWrap: { minHeight: 60, marginBottom: spacing.sm },
  totalsBox: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  // Horizontal totals strip — 3 subtle subtotals + 1 prominent red Net Payable.
  totalsStrip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: spacing.sm,
    gap: spacing.md,
    flexWrap: 'wrap',
  },
  totalsCells: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.md,
    minWidth: 320,
  },
  totalCell: {
    flex: 1,
    minWidth: 80,
  },
  totalCellLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.uiBold,
    letterSpacing: 0.4,
  },
  totalCellValue: {
    fontSize: 16,
    color: colors.text,
    fontFamily: typography.mono,
    marginTop: 2,
  },
  totalCellDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
  },
  netPayableBox: {
    backgroundColor: colors.brandRed,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minWidth: 220,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  netPayableLabel: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: typography.uiBold,
    letterSpacing: 0.8,
    opacity: 0.92,
  },
  netPayableValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontFamily: typography.mono,
    marginTop: 2,
    fontWeight: '700',
  },
  errorWrap: {
    padding: spacing.lg,
  },
  errorBanner: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: spacing.md,
    marginVertical: spacing.lg,
  },
  errorBannerText: {
    color: colors.danger,
    fontFamily: typography.ui,
    fontSize: 13,
  },
});

// ─── Mobile preview styles ───────────────────────────────────────────────────
const mStyles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.background },
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
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { fontSize: 26, color: '#475569', lineHeight: 26, marginTop: -2 },
  topTitle: { fontSize: 17, fontFamily: typography.uiBold, color: colors.text, letterSpacing: 0.2 },
  topSubtitle: { fontSize: 12, color: colors.textMuted, fontFamily: typography.uiMedium, marginTop: 2 },
  editBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.brandRed,
  },
  editBtnText: { color: '#FFFFFF', fontFamily: typography.uiBold, fontSize: 13, letterSpacing: 0.3 },

  scrollContent: { padding: spacing.md, paddingBottom: 40 },

  sheet: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    ...(typeof window !== 'undefined' ? ({ boxShadow: '0 2px 8px rgba(15,23,42,0.06)' } as any) : {}),
  },
  sheetHeader: {
    alignItems: 'center',
    paddingBottom: spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: '#0F172A',
    marginBottom: spacing.md,
  },
  brand: { fontSize: 20, fontFamily: typography.uiHeavy, color: colors.brandRed, letterSpacing: 3 },
  docLabel: { fontSize: 11, fontFamily: typography.uiBold, color: colors.textMuted, letterSpacing: 4, marginTop: 4 },

  section: { marginBottom: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  sectionLabel: {
    fontSize: 11,
    fontFamily: typography.uiHeavy,
    color: colors.textStrong,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  itemCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 8,
    marginBottom: 6,
    gap: 4,
  },
  itemTitle: {
    fontSize: 10,
    fontFamily: typography.uiHeavy,
    color: colors.brandRed,
    letterSpacing: 1.5,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginBottom: 2,
  },
  // Legacy KV row (unused after grid migration but kept to not break other refs)
  kvRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, gap: spacing.sm },
  kvLabel: { color: colors.textMuted, fontFamily: typography.uiMedium, fontSize: 12 },
  kvValue: { color: colors.textStrong, fontFamily: typography.ui, fontSize: 13, flexShrink: 1, textAlign: 'right' },
  muted: { color: colors.textMuted, fontFamily: typography.ui, fontSize: 13, paddingVertical: spacing.sm },

  // 3-column grid cells
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

  // Compact KV row for read-only preview — label left, value right.
  mkvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingVertical: 2,
    gap: spacing.sm,
  },
  mkvLabel: {
    color: colors.textMuted,
    fontFamily: typography.uiMedium,
    fontSize: 12,
  },
  mkvValue: {
    color: colors.textStrong,
    fontFamily: typography.uiMedium,
    fontSize: 13,
    flexShrink: 1,
    textAlign: 'right',
  },
  // Half-width KV pair (FROM left + AMOUNT right on a single row).
  mkvHalfRow: {
    flexDirection: 'row',
    paddingVertical: 2,
    gap: spacing.sm,
  },
  mkvHalf: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    minWidth: 0,
  },
  mkvHalfRight: {
    justifyContent: 'flex-end',
  },
  mkvValueLeft: {
    textAlign: 'left',
  },
  // Card header with title left, date right (ADV/FUEL preview).
  itemCardHeadInline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  itemCardDate: {
    color: colors.textMuted,
    fontFamily: typography.uiMedium,
    fontSize: 12,
    letterSpacing: 0.2,
  },

  totalsBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(247,72,61,0.2)',
    padding: 10,
    marginTop: 4,
  },

  // In-place edit mode styles.
  editInput: {
    fontSize: 13,
    fontFamily: typography.uiMedium,
    color: colors.textStrong,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: 2,
  },
  editActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'stretch',
  },
  cancelBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 92,
    backgroundColor: '#FFFFFF',
  },
  cancelBtnText: {
    color: colors.text,
    fontFamily: typography.uiHeavy,
    fontSize: 13,
  },
  saveError: {
    color: colors.danger,
    fontFamily: typography.uiMedium,
    fontSize: 13,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
});
