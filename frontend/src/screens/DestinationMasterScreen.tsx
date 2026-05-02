/**
 * DestinationMasterScreen — flat single table.
 * Branch field is an AutocompleteField fed by distinct branches in the same
 * table; user can pick an existing branch or type a new one.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { AutocompleteField } from '../components/AutocompleteField';
import { colors, radius, spacing, text } from '../constants/theme';
import { destinationService } from '../services/destinationService';
import { validatePincode, validateRequired } from '../utils/masterValidators';
import type { DestinationMasterItem } from '../../../shared/types/destinationMaster';

const EMPTY_FORM = { branch: '', name: '', city: '', state: '', pincode: '' };
type FormState = typeof EMPTY_FORM;
type FormErrors = Partial<Record<keyof FormState, string>>;

export function DestinationMasterScreen() {
  const [rows, setRows] = useState<DestinationMasterItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DestinationMasterItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errs, setErrs] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setListError(null);
    try {
      setRows(await destinationService.list());
    } catch {
      setListError('Could not load destinations.');
      setRows([]);
    }
  }, []);

  useAutoRefresh(load);

  // Distinct branches feed the branch autocomplete inside the form.
  const branchOptions = useMemo(
    () =>
      [...new Set((rows ?? []).map((r) => r.branch).filter((v): v is string => Boolean(v)))].sort(),
    [rows]
  );

  const openCreate = useCallback(() => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setErrs({});
    setFormError(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((row: DestinationMasterItem) => {
    setEditTarget(row);
    setForm({
      branch: row.branch ?? '',
      name: row.name ?? '',
      city: row.city ?? '',
      state: row.state ?? '',
      pincode: row.pincode ?? '',
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
    const nameErr = validateRequired(s.name, 'Destination name');
    if (nameErr) e.name = nameErr;
    const pinErr = validatePincode(s.pincode);
    if (pinErr) e.pincode = pinErr;
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
        branch: form.branch.trim() || null,
        name: form.name.trim(),
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        pincode: form.pincode.trim() || null,
      };
      if (editTarget) await destinationService.update(editTarget.id, payload);
      else await destinationService.create(payload);
      await load();
      closeModal();
    } catch {
      setFormError('Could not save destination. Try again.');
    } finally {
      setSaving(false);
    }
  }, [form, editTarget, load, closeModal]);

  const onSync = async () => {
    await destinationService.sync();
    Alert.alert('Sync complete', 'Tally sync finished.');
    await load();
  };

  const columns: Column<DestinationMasterItem>[] = [
    { key: 'branch', label: 'Branch', width: 180, render: (r) => r.branch || '—' },
    { key: 'name', label: 'Destination', render: (r) => r.name },
    {
      key: 'city', label: 'City / State', width: 220,
      render: (r) => [r.city, r.state].filter(Boolean).join(', ') || '—',
    },
    { key: 'pincode', label: 'Pincode', width: 100, render: (r) => r.pincode || '—' },
    {
      key: 'actions', label: '', width: 80, align: 'right',
      render: (r) => (
        <Pressable onPress={() => openEdit(r)} accessibilityRole="button" testID={`edit-dest-${r.id}`}>
          <Text style={styles.editAction}>Edit</Text>
        </Pressable>
      ),
    },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Destination Master</Text>
        <View style={styles.headerActions}>
          <SyncButton onSync={onSync} testID="sync-dest-btn" />
          <View style={styles.newBtn}>
            <ButtonPrimary title="New Destination" onPress={openCreate} testID="new-dest-btn" />
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
          <DataTable<DestinationMasterItem>
            columns={columns}
            rows={rows}
            keyExtractor={(r) => r.id}
            emptyLabel="No destinations yet — click New Destination to add one."
            testID="dest-table"
          />
        </View>
      )}

      <Modal
        visible={modalOpen}
        onClose={closeModal}
        title={editTarget ? 'Edit Destination' : 'New Destination'}
        testID="dest-modal"
      >
        <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContent}>
          {formError ? (
            <View style={styles.formError}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}

          <AutocompleteField
            label="Branch"
            value={form.branch}
            options={branchOptions}
            onChangeText={(v) => setForm((f) => ({ ...f, branch: v }))}
            placeholder="Type branch name (or leave blank)"
            testID="dest-branch-input"
          />
          <InputField
            label="Destination Name *"
            value={form.name}
            onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
            error={errs.name ?? null}
            fieldType="letters"
            testID="dest-name-input"
          />
          <View style={styles.row}>
            <View style={styles.rowHalf}>
              <InputField
                label="City"
                value={form.city}
                onChangeText={(v) => setForm((f) => ({ ...f, city: v }))}
                fieldType="letters"
                testID="dest-city-input"
              />
            </View>
            <View style={styles.rowHalf}>
              <InputField
                label="State"
                value={form.state}
                onChangeText={(v) => setForm((f) => ({ ...f, state: v }))}
                fieldType="letters"
                testID="dest-state-input"
              />
            </View>
          </View>
          <InputField
            label="Pincode"
            value={form.pincode}
            onChangeText={(v) => setForm((f) => ({ ...f, pincode: v }))}
            error={errs.pincode ?? null}
            fieldType="integer"
            testID="dest-pincode-input"
          />

          <View style={styles.actions}>
            <Pressable onPress={closeModal} style={styles.cancelBtn} testID="dest-cancel-btn">
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <View style={styles.submitWrap}>
              <ButtonPrimary
                title={editTarget ? 'Save changes' : 'Create destination'}
                onPress={onSubmit}
                loading={saving}
                testID="dest-submit-btn"
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
  newBtn: { minWidth: 170 },
  errorBanner: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  errorBannerText: { ...text.label, color: colors.danger },
  tableWrap: { flex: 1, minHeight: 200 },
  formScroll: { maxHeight: 480 },
  formContent: { paddingBottom: spacing.sm },
  formError: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  formErrorText: { ...text.label, color: colors.danger },
  row: { flexDirection: 'row', gap: spacing.sm },
  rowHalf: { flex: 1 },
  actions: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'flex-end', marginTop: spacing.sm, gap: spacing.sm,
  },
  cancelBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  cancelBtnText: { ...text.action, color: colors.textMuted, fontSize: 14 },
  submitWrap: { minWidth: 170 },
  editAction: {
    ...text.action, color: colors.primary,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
});
