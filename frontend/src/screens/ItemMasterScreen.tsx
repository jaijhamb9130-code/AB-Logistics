/**
 * ItemMasterScreen — items table with search + group filter, expanded form.
 * Item Group and Item Category are persisted via item_group_id / item_category_id
 * foreign keys on item_master. Tally Flavour, Batch, and Opening Qty/Rate/Value
 * are still local-only until the backend exposes those columns.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { ButtonPrimary } from '../components/ButtonPrimary';
import { DataTable, type Column } from '../components/DataTable';
import { InputField } from '../components/InputField';
import { Loader } from '../components/Loader';
import { Modal } from '../components/Modal';
import { SelectDropdown } from '../components/SelectDropdown';
import { SyncButton } from '../components/SyncButton';
import { colors, radius, spacing, text, typography } from '../constants/theme';
import { itemMasterService } from '../services/itemMasterService';
import { itemGroupService } from '../services/itemGroupService';
import { itemCategoryService } from '../services/itemCategoryService';
import { validateGstRate, validateRequired } from '../utils/masterValidators';
import { formatCurrency, formatQty } from '../utils/format';
import type { ItemMasterItem } from '../../../shared/types/itemMaster';
import type { ItemGroupItem } from '../../../shared/types/itemGroup';
import type { ItemCategoryItem } from '../../../shared/types/itemCategory';
import { useAuth } from '../context/AuthContext';
import { canDoAction } from '../navigation/guards';

const EMPTY_FORM = {
  name: '',
  hsn_code: '',
  gst_rate: '',
  unit: '',
  item_group_id: 0,      // 0 = none selected
  item_category_id: 0,
  batch: 'No',           // not persisted yet
  opening_qty: '',       // not persisted yet
  opening_rate: '',      // not persisted yet
};
type FormState = typeof EMPTY_FORM;
type FormErrors = Partial<Record<keyof FormState, string>>;

const BATCH_OPTIONS = ['No', 'Yes'];

// One row inside the Batch Entry modal. `batch_no` is the user-typed lot ID;
// qty × rate gives that batch's amount. Modal save aggregates these into the
// item's Opening Rate (weighted avg) and Opening Value (sum of amounts).
type BatchRow = { batch_no: string; qty: string; rate: string };
const newBatchRow = (): BatchRow => ({ batch_no: '', qty: '', rate: '' });

export function ItemMasterScreen() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ItemMasterItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('All Groups');

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ItemMasterItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errs, setErrs] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Linked masters — loaded once on mount, refreshed when items list refreshes.
  const [groups, setGroups] = useState<ItemGroupItem[]>([]);
  const [categories, setCategories] = useState<ItemCategoryItem[]>([]);

  // Batch breakdown for the current item (only used when batch === 'Yes').
  // Once batches are saved, Opening Rate and Opening Value are derived from
  // them and the user can no longer type those fields directly.
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchDraft, setBatchDraft] = useState<BatchRow[]>([]);

  const load = useCallback(async () => {
    setListError(null);
    try {
      setRows(await itemMasterService.list());
    } catch {
      setListError('Could not load items.');
      setRows([]);
    }
  }, []);

  useAutoRefresh(load);

  const refreshGroupsAndCategories = useCallback(() => {
    itemGroupService.list().then(setGroups).catch(() => setGroups([]));
    itemCategoryService.list().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    refreshGroupsAndCategories();
  }, [refreshGroupsAndCategories]);

  const openCreate = useCallback(() => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setBatches([]);
    setErrs({});
    setFormError(null);
    refreshGroupsAndCategories();
    setModalOpen(true);
  }, [refreshGroupsAndCategories]);

  const openEdit = useCallback(async (row: ItemMasterItem) => {
    setEditTarget(row);
    setForm({
      ...EMPTY_FORM,
      name: row.name ?? '',
      hsn_code: row.hsn_code ?? '',
      gst_rate: row.gst_rate != null ? String(row.gst_rate) : '',
      unit: (row as any).unit ?? '',
      batch: (row as any).batch === 'Yes' ? 'Yes' : 'No',
      opening_qty: (row as any).opening_qty != null ? String((row as any).opening_qty) : '',
      opening_rate: (row as any).opening_rate != null ? String((row as any).opening_rate) : '',
      item_group_id: row.item_group_id ?? 0,
      item_category_id: row.item_category_id ?? 0,
    });
    setBatches([]);
    setErrs({});
    setFormError(null);
    refreshGroupsAndCategories();
    setModalOpen(true);
    // Fetch any persisted opening batches and rehydrate the modal state.
    try {
      const full = await itemMasterService.get(row.id);
      const fetched = ((full as any).batches ?? []) as Array<{ batch_no: string | null; qty: number | string; rate: number | string }>;
      if (Array.isArray(fetched) && fetched.length > 0) {
        setBatches(
          fetched.map((b) => ({
            batch_no: b.batch_no ?? '',
            qty: String(b.qty ?? ''),
            rate: String(b.rate ?? ''),
          }))
        );
      }
    } catch {
      /* keep empty batches; non-fatal */
    }
  }, [refreshGroupsAndCategories]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditTarget(null);
  }, []);

  const validate = (s: FormState): FormErrors => {
    const e: FormErrors = {};
    const nameErr = validateRequired(s.name, 'Item name');
    if (nameErr) e.name = nameErr;
    const rateErr = validateGstRate(s.gst_rate);
    if (rateErr) e.gst_rate = rateErr;
    return e;
  };

  const onSubmit = useCallback(async () => {
    const e = validate(form);
    setErrs(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    setFormError(null);
    try {
      // Persisted fields. When batch=Yes, opening totals come from the
      // weighted batch breakdown; otherwise straight from the user's input.
      const payload = {
        name: form.name.trim(),
        hsn_code: form.hsn_code.trim().toUpperCase() || null,
        gst_rate: form.gst_rate.trim() === '' ? null : Number(form.gst_rate),
        unit: form.unit.trim() || null,
        batch: form.batch === 'Yes' ? 'Yes' : 'No',
        opening_qty: Number(displayOpeningQty) || 0,
        opening_rate: Number(displayOpeningRate) || 0,
        opening_value: Number(openingValue) || 0,
        item_group_id: form.item_group_id || null,
        item_category_id: form.item_category_id || null,
        // Per-batch breakdown — only meaningful when batch=Yes. Backend
        // splays these into `batch` rows linked to the item's opening
        // inventory_entries rollup.
        batches:
          form.batch === 'Yes'
            ? batches
              .filter((b) => b.batch_no.trim() !== '' || Number(b.qty) > 0)
              .map((b) => ({
                batch_no: b.batch_no.trim() || null,
                qty: Number(b.qty) || 0,
                rate: Number(b.rate) || 0,
              }))
            : [],
      };
      if (editTarget) await itemMasterService.update(editTarget.id, payload);
      else await itemMasterService.create(payload);
      await load();
      closeModal();
    } catch {
      setFormError('Could not save item. Try again.');
    } finally {
      setSaving(false);
    }
  }, [form, batches, editTarget, load, closeModal]);

  // Delete endpoint isn't wired up yet — show a placeholder alert until the
  // backend exposes DELETE /api/item-master/:id.
  const onDelete = useCallback((row: ItemMasterItem) => {
    Alert.alert('Delete not enabled', `"${row.name}" cannot be deleted yet — backend route is pending.`);
  }, []);

  const onSync = async () => {
    await itemMasterService.sync();
    Alert.alert('Sync complete', 'Tally sync finished.');
    await load();
  };

  // Aggregate the saved batches: total qty, total amount (sum of qty × rate),
  // and weighted-average rate. Used when batch === 'Yes' AND batches exist.
  const batchTotals = useMemo(() => {
    const totalQty = batches.reduce((s, b) => s + (Number(b.qty) || 0), 0);
    const totalAmt = batches.reduce(
      (s, b) => s + (Number(b.qty) || 0) * (Number(b.rate) || 0), 0
    );
    const avgRate = totalQty > 0 ? totalAmt / totalQty : 0;
    return { totalQty, totalAmt, avgRate };
  }, [batches]);

  // Whether the batch breakdown drives Opening Rate / Value.
  const useBatchTotals = form.batch === 'Yes' && batches.length > 0;

  // Display values for the three Opening fields. When batches are in play,
  // Opening Rate becomes the weighted average and Opening Value is the sum.
  const displayOpeningQty = useBatchTotals
    ? batchTotals.totalQty.toFixed(3)
    : form.opening_qty;
  const displayOpeningRate = useBatchTotals
    ? batchTotals.avgRate.toFixed(2)
    : form.opening_rate;
  const openingValue = useBatchTotals
    ? batchTotals.totalAmt.toFixed(2)
    : (() => {
      const q = Number(form.opening_qty);
      const r = Number(form.opening_rate);
      if (!Number.isFinite(q) || !Number.isFinite(r)) return '';
      return (q * r).toFixed(2);
    })();

  // Open the batch modal: seed the draft from existing batches, or one empty
  // row if this is the first time. Triggered by Enter / Tab on Opening Qty
  // when batch === 'Yes'.
  const openBatchEntry = () => {
    setBatchDraft(batches.length > 0 ? batches.map((b) => ({ ...b })) : [newBatchRow()]);
    setBatchModalOpen(true);
  };

  const maybeOpenBatchOnQty = () => {
    const q = Number(form.opening_qty);
    if (form.batch === 'Yes' && Number.isFinite(q) && q > 0 && batches.length === 0) {
      openBatchEntry();
    }
  };

  // Client-side search + group filter.
  const visibleRows = useMemo(() => {
    if (!rows) return null;
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (groupFilter !== 'All Groups' && r.item_group_name !== groupFilter) return false;
      return true;
    });
  }, [rows, search, groupFilter]);

  const columns: Column<ItemMasterItem>[] = [
    { key: 'name', label: 'Item Name', render: (r) => r.name },
    { key: 'group', label: 'Group', width: 130, render: (r) => r.item_group_name || '—' },
    { key: 'category', label: 'Category', width: 130, render: (r) => r.item_category_name || '—' },
    {
      key: 'batch',
      label: 'Batch',
      width: 90,
      render: (r) => {
        const isYes = (r as any).batch === 'Yes';
        return (
          <View style={[styles.badge, isYes ? styles.badgeYes : styles.badgeNo]}>
            <Text style={isYes ? styles.badgeYesText : styles.badgeNoText}>
              {isYes ? 'Yes' : 'No'}
            </Text>
          </View>
        );
      },
    },
    {
      key: 'gst_rate',
      label: 'GST %',
      width: 90,
      align: 'right',
      render: (r) => (r.gst_rate != null ? `${r.gst_rate}%` : '—'),
    },
    { key: 'hsn_code', label: 'HSN', width: 120, render: (r) => r.hsn_code || '—' },
    {
      key: 'op_qty',
      label: 'Op. Qty',
      width: 100,
      align: 'right',
      render: (r) => formatQty((r as any).opening_qty),
    },
    {
      key: 'op_value',
      label: 'Op. Value',
      width: 110,
      align: 'right',
      render: (r) => formatCurrency((r as any).opening_value),
    },
    {
      key: 'actions',
      label: '',
      width: 100,
      align: 'right',
      render: (r) => (
        <View style={styles.rowActions}>
          {canDoAction(user, 'itemmaster', 'edit') && (
            <Pressable
              onPress={() => openEdit(r)}
              accessibilityRole="button"
              accessibilityLabel="Edit"
              testID={`edit-item-${r.id}`}
              style={styles.iconBtn}
            >
              <Text style={styles.editIcon}>✎</Text>
            </Pressable>
          )}
          {canDoAction(user, 'itemmaster', 'delete') && (
            <Pressable
              onPress={() => onDelete(r)}
              accessibilityRole="button"
              accessibilityLabel="Delete"
              testID={`delete-item-${r.id}`}
              style={styles.iconBtn}
            >
              <Text style={styles.deleteIcon}>🗑</Text>
            </Pressable>
          )}
        </View>
      ),
    },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Items</Text>
        <View style={styles.headerActions}>
          <SyncButton onSync={onSync} testID="sync-item-btn" />
          {canDoAction(user, 'itemmaster', 'create') && (
            <View style={styles.newBtn}>
              <ButtonPrimary title="+ Add Item" onPress={openCreate} testID="new-item-btn" />
            </View>
          )}
        </View>
      </View>

      {/* Search + group filter bar */}
      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search items..."
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            testID="item-search"
          />
        </View>
        <View style={styles.groupFilterWrap}>
          <SelectDropdown
            label=""
            value={groupFilter}
            options={['All Groups', ...groups.map((g) => g.group_name)]}
            onSelect={setGroupFilter}
            placeholder="All Groups"
            testID="item-group-filter"
          />
        </View>
      </View>

      {listError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{listError}</Text>
        </View>
      ) : null}

      {visibleRows === null ? (
        <Loader />
      ) : (
        <View style={styles.tableWrap}>
          <DataTable<ItemMasterItem>
            columns={columns}
            rows={visibleRows}
            keyExtractor={(r) => r.id}
            emptyLabel="No items yet — click Add Item to add one."
            testID="item-table"
          />
        </View>
      )}

      <Modal
        visible={modalOpen}
        onClose={closeModal}
        title={editTarget ? 'Edit Item' : 'New Item'}
        testID="item-modal"
        maxWidth={560}
      >
        <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContent}>
          {formError ? (
            <View style={styles.formError}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}

          {/* Row 1: Item Name | Batch */}
          <View style={styles.row}>
            <View style={styles.rowHalf}>
              <InputField
                label="Item Name *"
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                error={errs.name ?? null}
                testID="item-name-input"
              />
            </View>
            <View style={styles.rowHalf}>
              <SelectDropdown
                label="Batch"
                value={form.batch}
                options={BATCH_OPTIONS}
                onSelect={(v) => setForm((f) => ({ ...f, batch: v }))}
                placeholder="No"
                testID="item-batch-input"
              />
            </View>
          </View>

          {/* Row 2: Item Group | Item Category */}
          <View style={styles.row}>
            <View style={styles.rowHalf}>
              <SelectDropdown
                label="Item Group"
                value={groups.find((g) => g.id === form.item_group_id)?.group_name ?? ''}
                options={groups.map((g) => g.group_name)}
                onSelect={(name) => {
                  const picked = groups.find((g) => g.group_name === name);
                  setForm((f) => ({ ...f, item_group_id: picked ? picked.id : 0 }));
                }}
                placeholder="Search group..."
                searchable
                testID="item-group-input"
              />
            </View>
            <View style={styles.rowHalf}>
              <SelectDropdown
                label="Item Category"
                value={categories.find((c) => c.id === form.item_category_id)?.category_name ?? ''}
                options={categories.map((c) => c.category_name)}
                onSelect={(name) => {
                  const picked = categories.find((c) => c.category_name === name);
                  setForm((f) => ({ ...f, item_category_id: picked ? picked.id : 0 }));
                }}
                placeholder="Search category..."
                searchable
                testID="item-category-input"
              />
            </View>
          </View>

          {/* Row 4: GST % | HSN Code | Unit */}
          <View style={styles.row}>
            <View style={styles.rowThird}>
              <InputField
                label="GST %"
                value={form.gst_rate}
                onChangeText={(v) => setForm((f) => ({ ...f, gst_rate: v }))}
                error={errs.gst_rate ?? null}
                fieldType="decimal"
                placeholder="0"
                testID="item-gst-rate-input"
              />
            </View>
            <View style={styles.rowThird}>
              <InputField
                label="HSN Code"
                value={form.hsn_code}
                onChangeText={(v) => setForm((f) => ({ ...f, hsn_code: v.toUpperCase() }))}
                fieldType="alphanumeric"
                autoCapitalize="characters"
                testID="item-hsn-input"
              />
            </View>
            <View style={styles.rowThird}>
              <InputField
                label="Unit"
                value={form.unit}
                onChangeText={(v) => setForm((f) => ({ ...f, unit: v }))}
                placeholder="e.g. ton / kg / bag / trip"
                testID="item-unit-input"
              />
            </View>
          </View>

          {/* Opening balance section */}
          <Text style={styles.sectionLabel}>OPENING BALANCE</Text>
          <View style={styles.row}>
            <View style={styles.rowThird}>
              <InputField
                label="Opening Qty"
                value={useBatchTotals ? displayOpeningQty : form.opening_qty}
                onChangeText={(v) => {
                  if (useBatchTotals) return; // qty is derived from batches
                  setForm((f) => ({ ...f, opening_qty: v }));
                }}
                onSubmitEditing={maybeOpenBatchOnQty}
                onBlur={maybeOpenBatchOnQty}
                editable={!useBatchTotals}
                fieldType="decimal"
                placeholder="0.000"
                testID="item-op-qty-input"
              />
            </View>
            <View style={styles.rowThird}>
              {useBatchTotals ? (
                <InputField
                  label="Opening Rate"
                  value={displayOpeningRate}
                  editable={false}
                  fieldType="decimal"
                  placeholder="0.00"
                  testID="item-op-rate-input"
                />
              ) : (
                <InputField
                  label="Opening Rate"
                  value={form.opening_rate}
                  onChangeText={(v) => setForm((f) => ({ ...f, opening_rate: v }))}
                  fieldType="decimal"
                  placeholder="0.00"
                  testID="item-op-rate-input"
                />
              )}
            </View>
            <View style={styles.rowThird}>
              <InputField
                label="Opening Value"
                value={openingValue || '0.00'}
                editable={false}
                fieldType="decimal"
                placeholder="0.00"
                testID="item-op-value-input"
              />
            </View>
          </View>

          {/* Batch summary chip — visible only when batch === 'Yes' AND
              the user has saved at least one batch. Click to reopen the
              modal and edit the batches. */}
          {useBatchTotals ? (
            <Pressable onPress={openBatchEntry} style={styles.batchSummaryChip}>
              <Text style={styles.batchSummaryText}>
                Batch Details · {batches.length} {batches.length === 1 ? 'row' : 'rows'} · Total Qty: {batchTotals.totalQty.toFixed(3)}
              </Text>
            </Pressable>
          ) : null}

          <View style={styles.actions}>
            <Pressable onPress={closeModal} style={styles.cancelBtn} testID="item-cancel-btn">
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <View style={styles.submitWrap}>
              <ButtonPrimary
                title={editTarget ? 'Save changes' : 'Create Item'}
                onPress={onSubmit}
                loading={saving}
                testID="item-submit-btn"
              />
            </View>
          </View>
        </ScrollView>
      </Modal>

      {/* Batch Entry modal — appears when batch === 'Yes' and the user
          enters / tabs out of Opening Qty. Lets the user split the opening
          stock across multiple batches; saving aggregates back into the
          form's Opening Rate (weighted avg) and Opening Value (sum). */}
      <Modal
        visible={batchModalOpen}
        onClose={() => setBatchModalOpen(false)}
        title={`Batch Entry — ${form.name || 'Item'}`}
        maxWidth={620}
        testID="batch-entry-modal"
      >
        <BatchEntryBody
          itemName={form.name || 'Item'}
          openingQty={Number(form.opening_qty) || 0}
          draft={batchDraft}
          setDraft={setBatchDraft}
          onCancel={() => setBatchModalOpen(false)}
          onSave={(rows) => {
            // Drop completely-empty trailing rows; keep partial rows so the
            // user can fix them later if they reopen the modal.
            const cleaned = rows.filter((r) =>
              (r.batch_no || '').trim() !== '' ||
              Number(r.qty) > 0 ||
              Number(r.rate) > 0
            );
            setBatches(cleaned);
            setBatchModalOpen(false);
          }}
        />
      </Modal>
    </View>
  );
}

// ── Batch Entry modal body ──────────────────────────────────────────────────
function BatchEntryBody({
  itemName: _itemName,
  openingQty,
  draft,
  setDraft,
  onCancel,
  onSave,
}: {
  itemName: string;
  openingQty: number;
  draft: BatchRow[];
  setDraft: React.Dispatch<React.SetStateAction<BatchRow[]>>;
  onCancel: () => void;
  onSave: (rows: BatchRow[]) => void;
}) {
  const totals = useMemo(() => {
    const totalQty = draft.reduce((s, b) => s + (Number(b.qty) || 0), 0);
    const totalAmt = draft.reduce(
      (s, b) => s + (Number(b.qty) || 0) * (Number(b.rate) || 0), 0
    );
    return { totalQty, totalAmt };
  }, [draft]);

  const qtyMatches = openingQty <= 0 || Math.abs(totals.totalQty - openingQty) < 0.0005;

  const updateRow = (idx: number, patch: Partial<BatchRow>) =>
    setDraft((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const removeRow = (idx: number) =>
    setDraft((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== idx) : rows));

  const addRow = () => setDraft((rows) => [...rows, newBatchRow()]);

  return (
    <View style={{ padding: spacing.lg, gap: spacing.md }}>
      {/* Column header */}
      <View style={batchStyles.tableHeader}>
        <Text style={[batchStyles.th, { width: 36 }]}>#</Text>
        <Text style={[batchStyles.th, { flex: 2, minWidth: 200 }]}>BATCH NO.</Text>
        <Text style={[batchStyles.th, batchStyles.thRight, { width: 90 }]}>QTY</Text>
        <Text style={[batchStyles.th, batchStyles.thRight, { width: 90 }]}>RATE</Text>
        <Text style={[batchStyles.th, batchStyles.thRight, { width: 110 }]}>AMOUNT</Text>
        <View style={{ width: 28 }} />
      </View>

      {draft.map((row, idx) => {
        const amt = (Number(row.qty) || 0) * (Number(row.rate) || 0);
        return (
          <View key={idx} style={batchStyles.tableRow}>
            <Text style={[batchStyles.cellMeta, { width: 36 }]}>{idx + 1}</Text>
            <View style={{ flex: 2, minWidth: 200 }}>
              <TextInput
                value={row.batch_no}
                onChangeText={(v) => updateRow(idx, { batch_no: v })}
                placeholder="Batch / Serial no."
                placeholderTextColor={colors.textMuted}
                style={batchStyles.input}
              />
            </View>
            <TextInput
              value={row.qty}
              onChangeText={(v) => updateRow(idx, { qty: v.replace(/[^0-9.]/g, '') })}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              style={[batchStyles.input, batchStyles.inputRight, { width: 90 }]}
            />
            <TextInput
              value={row.rate}
              onChangeText={(v) => updateRow(idx, { rate: v.replace(/[^0-9.]/g, '') })}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              style={[batchStyles.input, batchStyles.inputRight, { width: 90 }]}
            />
            <View style={[batchStyles.amountBox, { width: 110 }]}>
              <Text style={batchStyles.amountText}>{amt > 0 ? amt.toFixed(2) : '0'}</Text>
            </View>
            <Pressable onPress={() => removeRow(idx)} style={batchStyles.removeBtn}>
              <Text style={batchStyles.removeBtnText}>×</Text>
            </Pressable>
          </View>
        );
      })}

      <Pressable onPress={addRow} style={batchStyles.addBtn}>
        <Text style={batchStyles.addBtnText}>+ Add Batch</Text>
      </Pressable>

      <View style={batchStyles.totalsRow}>
        <Text style={batchStyles.totalsLabel}>
          Total Qty:{' '}
          <Text style={qtyMatches ? batchStyles.totalsValue : batchStyles.totalsMismatch}>
            {totals.totalQty.toFixed(3)}
          </Text>
          {!qtyMatches && openingQty > 0 ? (
            <Text style={batchStyles.totalsHint}>  (need {openingQty.toFixed(3)})</Text>
          ) : null}
        </Text>
        <Text style={batchStyles.totalsLabel}>
          Total Amt: <Text style={batchStyles.totalsValue}>₹{totals.totalAmt.toFixed(2)}</Text>
        </Text>
      </View>

      <View style={batchStyles.actions}>
        <Pressable onPress={onCancel} style={batchStyles.cancelBtn}>
          <Text style={batchStyles.cancelBtnText}>Cancel</Text>
        </Pressable>
        <View style={{ minWidth: 120 }}>
          <ButtonPrimary
            title="Save"
            onPress={() => onSave(draft)}
            disabled={draft.length === 0}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: spacing.md,
  },
  title: { ...text.heading, fontSize: 24, lineHeight: 32 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  newBtn: { minWidth: 130 },

  // Toolbar
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    height: 40,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: radius.md,
    backgroundColor: colors.card,
    flex: 1,
    maxWidth: 360,
  },
  searchIcon: { color: colors.textMuted, marginRight: 8, fontSize: 14 },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    fontFamily: typography.ui,
    outlineStyle: 'none' as any,
  },
  // Width-bounded wrapper for the SelectDropdown filter so it doesn't stretch
  // to fill the toolbar — keeps the chip-like look from the reference UI.
  groupFilterWrap: { width: 180 },

  errorBanner: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  errorBannerText: { ...text.label, color: colors.danger },
  tableWrap: { flex: 1, minHeight: 200 },

  // Badges
  badge: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 6, alignSelf: 'flex-start',
  },
  badgeYes: { backgroundColor: '#DCFCE7' },
  badgeYesText: { color: '#15803D', fontFamily: typography.uiBold, fontSize: 11 },
  badgeNo: { backgroundColor: '#F1F5F9' },
  badgeNoText: { color: '#64748B', fontFamily: typography.uiBold, fontSize: 11 },

  // Row actions (edit/delete)
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  iconBtn: {
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 6,
  },
  editIcon: { color: colors.brandRed, fontSize: 16 },
  deleteIcon: { color: colors.danger, fontSize: 16 },

  // Form
  formScroll: { maxHeight: 580 },
  formContent: { paddingBottom: spacing.sm },
  formError: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  formErrorText: { ...text.label, color: colors.danger },

  row: { flexDirection: 'row', gap: spacing.sm },
  rowHalf: { flex: 1 },
  rowThird: { flex: 1 },

  sectionLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.uiBold,
    letterSpacing: 1.4,
    marginTop: spacing.sm,
    marginBottom: 6,
  },

  actions: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'flex-end', marginTop: spacing.md, gap: spacing.sm,
  },
  cancelBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  cancelBtnText: { ...text.action, color: colors.textMuted, fontSize: 14 },
  submitWrap: { minWidth: 150 },

  // Clickable summary chip below the Opening Balance row — visible only
  // when batches have been entered.
  batchSummaryChip: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  batchSummaryText: {
    color: '#1D4ED8',
    fontFamily: typography.uiBold,
    fontSize: 13,
    letterSpacing: 0.2,
  },
});

// ── Styles for the Batch Entry modal body ─────────────────────────────────
const batchStyles = StyleSheet.create({
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: '#F8FAFC',
    borderRadius: radius.sm,
    gap: 8,
  },
  th: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.uiBold,
    letterSpacing: 1,
  },
  thRight: { textAlign: 'right' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.sm,
  },
  cellMeta: { color: colors.textMuted, fontSize: 13, fontFamily: typography.ui },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    fontSize: 14,
    color: colors.text,
    fontFamily: typography.uiMedium,
    minHeight: 38,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}),
  },
  inputRight: { textAlign: 'right' },
  amountBox: {
    height: 38,
    borderRadius: radius.md,
    backgroundColor: '#FEFCE8',
    borderWidth: 1,
    borderColor: '#FDE68A',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  amountText: { color: colors.text, fontFamily: typography.uiBold, fontSize: 14 },
  removeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  removeBtnText: { color: colors.danger, fontSize: 18, lineHeight: 18 },
  addBtn: { paddingVertical: spacing.xs, alignSelf: 'flex-start' },
  addBtnText: { color: '#16A34A', fontFamily: typography.uiBold, fontSize: 13 },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  totalsLabel: {
    color: colors.textMuted,
    fontFamily: typography.uiMedium,
    fontSize: 13,
  },
  totalsValue: { color: colors.text, fontFamily: typography.uiBold },
  totalsMismatch: { color: colors.danger, fontFamily: typography.uiBold },
  totalsHint: { color: colors.textMuted, fontFamily: typography.ui, fontSize: 12 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cancelBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  cancelBtnText: { ...text.action, color: colors.textMuted, fontSize: 14 },
});
