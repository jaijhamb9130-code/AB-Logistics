/**
 * VehicleMasterScreen — one row per truck. `name` = registration number (plate);
 * UNIQUE in DB so each truck appears once in Bilty Truck No autocomplete.
 *
 * Vehicles live as ledger_master rows in the dedicated "Vehicles" sub-group
 * of Sundry Creditors; optional metadata (vehicle_type, owner) sits in
 * `vehicle_meta` keyed by the ledger id.
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
import { AutocompleteField } from '../components/AutocompleteField';
import { Loader } from '../components/Loader';
import { Modal } from '../components/Modal';
import { SyncButton } from '../components/SyncButton';
import { colors, radius, spacing, text } from '../constants/theme';
import { vehicleMasterService } from '../services/vehicleMasterService';
import { ownerService } from '../services/ownerService';
import { validateRequired } from '../utils/masterValidators';
import type { VehicleMasterItem } from '../../../shared/types/vehicleMaster';
import { useAuth } from '../context/AuthContext';
import { canDoAction } from '../navigation/guards';

const EMPTY_FORM = { name: '', vehicle_type: '', owner_name: '' };

type FormState = typeof EMPTY_FORM;
type FormErrors = Partial<Record<keyof FormState, string>>;

export function VehicleMasterScreen() {
  const { user } = useAuth();
  const [rows, setRows] = useState<VehicleMasterItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<VehicleMasterItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errs, setErrs] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [ownerOptions, setOwnerOptions] = useState<string[]>([]);

  // Pull Owner Master rows for the autocomplete. Reused on every modal open.
  useEffect(() => {
    ownerService.list()
      .then((rs) => setOwnerOptions(rs.map((r) => r.name).sort()))
      .catch(() => setOwnerOptions([]));
  }, []);

  const load = useCallback(async () => {
    setListError(null);
    try {
      setRows(await vehicleMasterService.list());
    } catch {
      setListError('Could not load vehicles.');
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

  const openEdit = useCallback((row: VehicleMasterItem) => {
    setEditTarget(row);
    setForm({
      name: row.name ?? '',
      vehicle_type: row.vehicle_type ?? '',
      owner_name: (row as any).owner_name ?? '',
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
    const nameErr = validateRequired(s.name, 'Registration number');
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
        name: form.name.trim().toUpperCase(),
        vehicle_type: form.vehicle_type.trim() || null,
        owner_name: form.owner_name.trim() || null,
      };
      if (editTarget) await vehicleMasterService.update(editTarget.id, payload);
      else await vehicleMasterService.create(payload);
      await load();
      closeModal();
    } catch (err: any) {
      const code = err?.response?.data?.error;
      if (code === 'name_taken') setFormError('A vehicle with that registration number already exists.');
      else setFormError('Could not save vehicle. Try again.');
    } finally {
      setSaving(false);
    }
  }, [form, editTarget, load, closeModal]);

  const onSync = async () => {
    await vehicleMasterService.sync();
    Alert.alert('Sync complete', 'Tally sync finished.');
    await load();
  };

  // Hard delete with native confirm + 409 in_use fallback.
  const onDelete = useCallback(
    async (row: VehicleMasterItem) => {
      const ok =
        typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm(`Delete "${row.name}"? This cannot be undone.`)
          : true;
      if (!ok) return;
      try {
        await vehicleMasterService.delete(row.id);
        await load();
      } catch (err: any) {
        const code = err?.response?.data?.error;
        const message =
          code === 'in_use'
            ? 'Cannot delete — vehicle is referenced by an existing record.'
            : 'Could not delete vehicle. Try again.';
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          window.alert(message);
        } else {
          Alert.alert('Delete failed', message);
        }
      }
    },
    [load],
  );

  const columns: Column<VehicleMasterItem>[] = [
    { key: 'name', label: 'Reg No', render: (r) => r.name },
    { key: 'vehicle_type', label: 'Type', render: (r) => r.vehicle_type || '—' },
    { key: 'owner_name', label: 'Owner', render: (r) => (r as any).owner_name || '—' },
    {
      key: 'actions', label: '', width: 140, align: 'right',
      render: (r) => (
        <View style={styles.actionsCell}>
          {canDoAction(user, 'vehiclemaster', 'edit') && (
            <Pressable onPress={() => openEdit(r)} accessibilityRole="button" testID={`edit-vehicle-${r.id}`}>
              <Text style={styles.editAction}>Edit</Text>
            </Pressable>
          )}
          {canDoAction(user, 'vehiclemaster', 'delete') && (
            <Pressable onPress={() => onDelete(r)} accessibilityRole="button" testID={`delete-vehicle-${r.id}`}>
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
        <Text style={styles.title}>Vehicle Master</Text>
        <View style={styles.headerActions}>
          <SyncButton onSync={onSync} testID="sync-vehicle-btn" />
          {canDoAction(user, 'vehiclemaster', 'create') && (
            <View style={styles.newBtn}>
              <ButtonPrimary title="New Vehicle" onPress={openCreate} testID="new-vehicle-btn" />
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
          <DataTable<VehicleMasterItem>
            columns={columns}
            rows={rows}
            keyExtractor={(r) => r.id}
            emptyLabel="No vehicles yet — click New Vehicle to add one."
            testID="vehicle-table"
          />
        </View>
      )}

      <Modal
        visible={modalOpen}
        onClose={closeModal}
        title={editTarget ? `Edit ${editTarget.name}` : 'New Vehicle'}
        testID="vehicle-modal"
      >
        <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContent}>
          {formError ? (
            <View style={styles.formError}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}

          <View style={styles.row}>
            <View style={styles.rowHalf}>
              <InputField
                label="Registration No *"
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v.toUpperCase() }))}
                error={errs.name ?? null}
                fieldType="alphanumeric"
                autoCapitalize="characters"
                placeholder="MH-12-AB-1234"
                testID="vehicle-name-input"
              />
            </View>
            <View style={styles.rowHalf}>
              <InputField
                label="Vehicle Type"
                value={form.vehicle_type}
                onChangeText={(v) => setForm((f) => ({ ...f, vehicle_type: v }))}
                placeholder="e.g. 10-wheeler"
                testID="vehicle-type-input"
              />
            </View>
          </View>

          <AutocompleteField
            label="Owner"
            value={form.owner_name}
            options={ownerOptions}
            onChangeText={(v) => setForm((f) => ({ ...f, owner_name: v }))}
            placeholder="Pick from Owner Master"
            testID="vehicle-owner-input"
          />

          <View style={styles.actions}>
            <Pressable onPress={closeModal} style={styles.cancelBtn} testID="vehicle-cancel-btn">
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <View style={styles.submitWrap}>
              <ButtonPrimary
                title={editTarget ? 'Save changes' : 'Create vehicle'}
                onPress={onSubmit}
                loading={saving}
                testID="vehicle-submit-btn"
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
  newBtn: { minWidth: 150 },
  errorBanner: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  errorBannerText: { ...text.label, color: colors.danger },
  tableWrap: { flex: 1, minHeight: 200 },
  formScroll: { maxHeight: 600 },
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
    justifyContent: 'flex-end', marginTop: spacing.md, gap: spacing.sm,
  },
  cancelBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  cancelBtnText: { ...text.action, color: colors.textMuted, fontSize: 14 },
  submitWrap: { minWidth: 150 },
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
