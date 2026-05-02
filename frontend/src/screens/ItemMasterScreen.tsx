/**
 * ItemMasterScreen — goods types with HSN code + GST rate.
 * Feeds Bilty "Goods Type" autocomplete via item_master.name.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { ButtonPrimary } from '../components/ButtonPrimary';
import { DataTable, type Column } from '../components/DataTable';
import { InputField } from '../components/InputField';
import { Loader } from '../components/Loader';
import { Modal } from '../components/Modal';
import { SyncButton } from '../components/SyncButton';
import { colors, radius, spacing, text } from '../constants/theme';
import { itemMasterService } from '../services/itemMasterService';
import { validateGstRate, validateRequired } from '../utils/masterValidators';
import type { ItemMasterItem } from '../../../shared/types/itemMaster';

const EMPTY_FORM = { name: '', hsn_code: '', gst_rate: '' };
type FormState = typeof EMPTY_FORM;
type FormErrors = Partial<Record<keyof FormState, string>>;

export function ItemMasterScreen() {
  const [rows, setRows] = useState<ItemMasterItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ItemMasterItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errs, setErrs] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  const openCreate = useCallback(() => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setErrs({});
    setFormError(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((row: ItemMasterItem) => {
    setEditTarget(row);
    setForm({
      name: row.name ?? '',
      hsn_code: row.hsn_code ?? '',
      gst_rate: row.gst_rate != null ? String(row.gst_rate) : '',
    });
    setErrs({});
    setFormError(null);
    setModalOpen(true);
  }, []);

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
      const payload = {
        name: form.name.trim(),
        hsn_code: form.hsn_code.trim().toUpperCase() || null,
        gst_rate: form.gst_rate.trim() === '' ? null : Number(form.gst_rate),
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
  }, [form, editTarget, load, closeModal]);

  const onSync = async () => {
    await itemMasterService.sync();
    Alert.alert('Sync complete', 'Tally sync finished.');
    await load();
  };

  const columns: Column<ItemMasterItem>[] = [
    { key: 'name', label: 'Item Name', render: (r) => r.name },
    { key: 'hsn_code', label: 'HSN Code', width: 140, render: (r) => r.hsn_code || '—' },
    {
      key: 'gst_rate', label: 'GST %', width: 100, align: 'right',
      render: (r) => (r.gst_rate != null ? `${r.gst_rate}%` : '—'),
    },
    {
      key: 'actions', label: '', width: 80, align: 'right',
      render: (r) => (
        <Pressable onPress={() => openEdit(r)} accessibilityRole="button" testID={`edit-item-${r.id}`}>
          <Text style={styles.editAction}>Edit</Text>
        </Pressable>
      ),
    },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Item Master</Text>
        <View style={styles.headerActions}>
          <SyncButton onSync={onSync} testID="sync-item-btn" />
          <View style={styles.newBtn}>
            <ButtonPrimary title="New Item" onPress={openCreate} testID="new-item-btn" />
          </View>
        </View>
      </View>

      {listError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{listError}</Text>
        </View>
      ) : null}

      {rows === null ? (
        <Loader />
      ) : (
        <View style={styles.tableWrap}>
          <DataTable<ItemMasterItem>
            columns={columns}
            rows={rows}
            keyExtractor={(r) => r.id}
            emptyLabel="No items yet — click New Item to add one."
            testID="item-table"
          />
        </View>
      )}

      <Modal
        visible={modalOpen}
        onClose={closeModal}
        title={editTarget ? 'Edit Item' : 'New Item'}
        testID="item-modal"
      >
        <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContent}>
          {formError ? (
            <View style={styles.formError}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}

          <InputField
            label="Item Name *"
            value={form.name}
            onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
            error={errs.name ?? null}
            testID="item-name-input"
          />
          <InputField
            label="HSN Code"
            value={form.hsn_code}
            onChangeText={(v) => setForm((f) => ({ ...f, hsn_code: v.toUpperCase() }))}
            fieldType="alphanumeric"
            autoCapitalize="characters"
            testID="item-hsn-input"
          />
          <InputField
            label="GST Rate (%)"
            value={form.gst_rate}
            onChangeText={(v) => setForm((f) => ({ ...f, gst_rate: v }))}
            error={errs.gst_rate ?? null}
            fieldType="decimal"
            placeholder="e.g. 18"
            testID="item-gst-rate-input"
          />

          <View style={styles.actions}>
            <Pressable onPress={closeModal} style={styles.cancelBtn} testID="item-cancel-btn">
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <View style={styles.submitWrap}>
              <ButtonPrimary
                title={editTarget ? 'Save changes' : 'Create item'}
                onPress={onSubmit}
                loading={saving}
                testID="item-submit-btn"
              />
            </View>
          </View>
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: spacing.lg,
  },
  title: { ...text.heading, fontSize: 24, lineHeight: 32 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  newBtn: { minWidth: 130 },
  errorBanner: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  errorBannerText: { ...text.label, color: colors.danger },
  tableWrap: { flex: 1, minHeight: 200 },
  formScroll: { maxHeight: 460 },
  formContent: { paddingBottom: spacing.sm },
  formError: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  formErrorText: { ...text.label, color: colors.danger },
  actions: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'flex-end', marginTop: spacing.sm, gap: spacing.sm,
  },
  cancelBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  cancelBtnText: { ...text.action, color: colors.textMuted, fontSize: 14 },
  submitWrap: { minWidth: 130 },
  editAction: {
    ...text.action, color: colors.primary,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
});
