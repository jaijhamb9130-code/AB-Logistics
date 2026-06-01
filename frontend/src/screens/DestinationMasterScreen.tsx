/**
 * DestinationMasterScreen — flat single table.
 * Only the destination name is captured here; `branch`, `city`, `state`, and
 * `pincode` columns still exist in the DB schema but are written as null.
 */

import React, { useCallback, useState } from 'react';
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
import { destinationService } from '../services/destinationService';
import { validateRequired } from '../utils/masterValidators';
import type { DestinationMasterItem } from '../../../shared/types/destinationMaster';
import { useAuth } from '../context/AuthContext';
import { canDoAction } from '../navigation/guards';

const EMPTY_FORM = { name: '' };
type FormState = typeof EMPTY_FORM;
type FormErrors = Partial<Record<keyof FormState, string>>;

export function DestinationMasterScreen() {
  const { user } = useAuth();
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

  const openCreate = useCallback(() => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setErrs({});
    setFormError(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((row: DestinationMasterItem) => {
    setEditTarget(row);
    setForm({ name: row.name ?? '' });
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
        branch: null,
        name: form.name.trim(),
        city: null,
        state: null,
        pincode: null,
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

  // Hard delete with native confirm + 409 in_use fallback.
  const onDelete = useCallback(
    async (row: DestinationMasterItem) => {
      const ok =
        typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm(`Delete "${row.name}"? This cannot be undone.`)
          : true;
      if (!ok) return;
      try {
        await destinationService.delete(row.id);
        await load();
      } catch (err: any) {
        const code = err?.response?.data?.error;
        const message =
          code === 'in_use'
            ? 'Cannot delete — destination is referenced by an existing record.'
            : 'Could not delete destination. Try again.';
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          window.alert(message);
        } else {
          Alert.alert('Delete failed', message);
        }
      }
    },
    [load],
  );

  const columns: Column<DestinationMasterItem>[] = [
    { key: 'name', label: 'Destination', render: (r) => r.name },
    {
      key: 'actions', label: '', width: 140, align: 'right',
      render: (r) => (
        <View style={styles.actionsCell}>
          {canDoAction(user, 'destinationmaster', 'edit') && (
            <Pressable onPress={() => openEdit(r)} accessibilityRole="button" testID={`edit-dest-${r.id}`}>
              <Text style={styles.editAction}>Edit</Text>
            </Pressable>
          )}
          {canDoAction(user, 'destinationmaster', 'delete') && (
            <Pressable onPress={() => onDelete(r)} accessibilityRole="button" testID={`delete-dest-${r.id}`}>
              <Text style={styles.deleteAction}>Delete</Text>
            </Pressable>
          )}
        </View>
      ),
    },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Destination Master</Text>
        <View style={styles.headerActions}>
          <SyncButton onSync={onSync} testID="sync-dest-btn" />
          {canDoAction(user, 'destinationmaster', 'create') && (
            <View style={styles.newBtn}>
              <ButtonPrimary title="New Destination" onPress={openCreate} testID="new-dest-btn" />
            </View>
          )}
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

          <InputField
            label="Destination Name *"
            value={form.name}
            onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
            error={errs.name ?? null}
            fieldType="letters"
            testID="dest-name-input"
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
  deleteAction: {
    ...text.action, color: colors.danger,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  actionsCell: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    gap: spacing.xs,
  },
});
