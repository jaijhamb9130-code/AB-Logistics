/**
 * VehiclesScreen — fleet list + New/Edit/Deactivate (Phase 5 / VEHICLE-01..03).
 *
 * Layout mirrors UsersScreen:
 *   header row: "Vehicles" title + "New Vehicle" button
 *   DataTable: vehicle_no, type, owner, status pill, actions (Edit / Deactivate)
 *   Modal form (create + edit) using InputField
 *   ConfirmDialog for deactivate
 *
 * Permission strategy: backend enforces vehicle.read / vehicle.edit per route.
 * The tab is visible to all authenticated users (backend returns 403 if the
 * caller lacks vehicle.read).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ButtonPrimary } from '../components/ButtonPrimary';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DataTable, type Column } from '../components/DataTable';
import { InputField } from '../components/InputField';
import { Loader } from '../components/Loader';
import { Modal } from '../components/Modal';
import { colors, radius, spacing, text } from '../constants/theme';
import { vehicleService } from '../services/vehicleService';
import { validateVehicle, type VehicleErrors } from '../utils/vehicleValidation';
import type { Vehicle } from '../../../shared/types/vehicle';

const EMPTY_FORM = { vehicle_no: '', vehicle_type: '', owner_name: '' };

const FIELD_ERROR_COPY: Record<string, string> = {
  required: 'Required',
  invalid_format: 'Use letters, digits, dash, space, or dot (2–64 chars)',
};

export function VehiclesScreen() {
  const [rows, setRows] = useState<Vehicle[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  // Create + edit share the same modal (editTarget=null → create).
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Vehicle | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errs, setErrs] = useState<VehicleErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Deactivate confirm
  const [deactivateTarget, setDeactivateTarget] = useState<Vehicle | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  // Activate confirm
  const [activateTarget, setActivateTarget] = useState<Vehicle | null>(null);
  const [activating, setActivating] = useState(false);

  const load = useCallback(async () => {
    setListError(null);
    try {
      const list = await vehicleService.list();
      setRows(list);
    } catch {
      setListError('Could not load vehicles. Try again.');
      setRows([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = useCallback(() => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setErrs({});
    setFormError(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((v: Vehicle) => {
    setEditTarget(v);
    setForm({
      vehicle_no: v.vehicle_no,
      vehicle_type: v.vehicle_type ?? '',
      owner_name: v.owner_name ?? '',
    });
    setErrs({});
    setFormError(null);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setErrs({});
    setFormError(null);
  }, []);

  const onSubmit = useCallback(async () => {
    const v = validateVehicle(form);
    setErrs(v);
    if (Object.keys(v).length > 0) return;

    setSubmitting(true);
    setFormError(null);
    try {
      if (editTarget) {
        await vehicleService.update(editTarget.id, {
          vehicle_no: form.vehicle_no.trim(),
          vehicle_type: form.vehicle_type || null,
          owner_name: form.owner_name || null,
        });
      } else {
        await vehicleService.create({
          vehicle_no: form.vehicle_no.trim(),
          vehicle_type: form.vehicle_type || null,
          owner_name: form.owner_name || null,
        });
      }
      await load();
      closeModal();
    } catch (e: any) {
      const code = e?.response?.data?.error;
      if (code === 'vehicle_no_taken') {
        setFormError('That vehicle number is already taken.');
      } else if (code === 'invalid_vehicle_no') {
        setFormError('Vehicle number format is invalid.');
      } else {
        setFormError('Could not save vehicle. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }, [form, editTarget, load, closeModal]);

  const openDeactivate = useCallback((v: Vehicle) => setDeactivateTarget(v), []);

  const onDeactivateConfirm = useCallback(async () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      await vehicleService.deactivate(deactivateTarget.id);
      await load();
      setDeactivateTarget(null);
    } catch {
      Alert.alert('Action failed', 'Could not deactivate vehicle.');
      setDeactivateTarget(null);
    } finally {
      setDeactivating(false);
    }
  }, [deactivateTarget, load]);

  const openActivate = useCallback((v: Vehicle) => setActivateTarget(v), []);

  const onActivateConfirm = useCallback(async () => {
    if (!activateTarget) return;
    setActivating(true);
    try {
      await vehicleService.activate(activateTarget.id);
      await load();
      setActivateTarget(null);
    } catch {
      Alert.alert('Action failed', 'Could not activate vehicle.');
      setActivateTarget(null);
    } finally {
      setActivating(false);
    }
  }, [activateTarget, load]);

  const columns: Column<Vehicle>[] = [
    { key: 'vehicle_no', label: 'Vehicle No', width: 180, render: (r) => r.vehicle_no },
    { key: 'vehicle_type', label: 'Type', width: 140, render: (r) => r.vehicle_type || '—' },
    { key: 'owner_name', label: 'Owner', render: (r) => r.owner_name || '—' },
    {
      key: 'is_active', label: 'Status', width: 110,
      render: (r) => (
        <View style={[styles.badge, r.is_active ? styles.badgeActive : styles.badgeInactive]}>
          <Text style={[styles.badgeText, { color: r.is_active ? colors.success : colors.danger }]}>
            {r.is_active ? 'Active' : 'Inactive'}
          </Text>
        </View>
      ),
    },
    {
      key: 'actions', label: '', width: 180, align: 'right',
      render: (r) => (
        <View style={styles.rowActions}>
          <Pressable onPress={() => openEdit(r)} accessibilityRole="button" testID={`edit-vehicle-${r.id}`}>
            <Text style={styles.editAction}>Edit</Text>
          </Pressable>
          {r.is_active ? (
            <Pressable onPress={() => openDeactivate(r)} accessibilityRole="button" testID={`deactivate-vehicle-${r.id}`}>
              <Text style={styles.deactivateAction}>Deactivate</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => openActivate(r)} accessibilityRole="button" testID={`activate-vehicle-${r.id}`}>
              <Text style={styles.activateAction}>Activate</Text>
            </Pressable>
          )}
        </View>
      ),
    },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Vehicles</Text>
        <View style={styles.headerBtn}>
          <ButtonPrimary title="New Vehicle" onPress={openCreate} testID="new-vehicle-btn" />
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
          <DataTable<Vehicle>
            columns={columns}
            rows={rows}
            keyExtractor={(r) => r.id}
            emptyLabel="No vehicles yet — click New Vehicle to add one."
            testID="vehicles-table"
          />
        </View>
      )}

      <Modal
        visible={modalOpen}
        onClose={closeModal}
        title={editTarget ? `Edit ${editTarget.vehicle_no}` : 'New Vehicle'}
        testID="vehicle-modal"
      >
        <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContent}>
          {formError ? (
            <View style={styles.formError}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}

          <InputField
            label="Vehicle No"
            value={form.vehicle_no}
            onChangeText={(v) => setForm((f) => ({ ...f, vehicle_no: v }))}
            error={errs.vehicle_no ? FIELD_ERROR_COPY[errs.vehicle_no] : null}
            autoCapitalize="characters"
            autoCorrect={false}
            testID="vehicle-no-input"
          />

          <InputField
            label="Type (optional)"
            value={form.vehicle_type}
            onChangeText={(v) => setForm((f) => ({ ...f, vehicle_type: v }))}
            placeholder="e.g. 10-wheeler"
            testID="vehicle-type-input"
          />

          <InputField
            label="Owner (optional)"
            value={form.owner_name}
            onChangeText={(v) => setForm((f) => ({ ...f, owner_name: v }))}
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
                loading={submitting}
                testID="vehicle-submit-btn"
              />
            </View>
          </View>
        </ScrollView>
      </Modal>

      <ConfirmDialog
        visible={!!deactivateTarget}
        title="Deactivate vehicle"
        message={deactivateTarget ? `Deactivate ${deactivateTarget.vehicle_no}? It will no longer appear for new assignments.` : ''}
        confirmLabel="Deactivate"
        danger
        loading={deactivating}
        onCancel={() => setDeactivateTarget(null)}
        onConfirm={onDeactivateConfirm}
        testID="deactivate-vehicle-confirm"
      />

      <ConfirmDialog
        visible={!!activateTarget}
        title="Activate vehicle"
        message={activateTarget ? `Activate ${activateTarget.vehicle_no}? It will appear again for new assignments.` : ''}
        confirmLabel="Activate"
        variant="default"
        loading={activating}
        onCancel={() => setActivateTarget(null)}
        onConfirm={onActivateConfirm}
        testID="activate-vehicle-confirm"
      />
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
  headerBtn: { minWidth: 160 },
  tableWrap: { flex: 1, minHeight: 200 },
  errorBanner: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  errorBannerText: { ...text.label, color: colors.danger },
  badge: {
    paddingHorizontal: spacing.sm, paddingVertical: 2,
    borderRadius: radius.sm, alignSelf: 'flex-start',
  },
  badgeActive: { backgroundColor: 'rgba(34,197,94,0.12)' },
  badgeInactive: { backgroundColor: 'rgba(239,68,68,0.12)' },
  badgeText: { ...text.pill },
  rowActions: {
    flexDirection: 'row', justifyContent: 'flex-end',
    alignItems: 'center', gap: spacing.sm,
  },
  editAction: {
    ...text.action,
    color: colors.primary,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  deactivateAction: {
    ...text.action,
    color: colors.danger,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  activateAction: {
    ...text.action,
    color: colors.success,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  formScroll: { maxHeight: 500 },
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
  cancelBtn: {
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },
  cancelBtnText: { ...text.action, color: colors.textMuted, fontSize: 14 },
  submitWrap: { minWidth: 130 },
});
