/**
 * VehicleMasterScreen — one row per truck. `name` = registration number (plate);
 * UNIQUE in DB so each truck appears once in Bilty Truck No autocomplete.
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
import { vehicleMasterService } from '../services/vehicleMasterService';
import {
  validateDate, validateMobile, validatePAN, validateRequired,
} from '../utils/masterValidators';
import type { VehicleMasterItem } from '../../../shared/types/vehicleMaster';

const EMPTY_FORM = {
  name: '', vehicle_type: '',
  owner_name: '', owner_mobile: '', owner_pan: '',
  chassis_no: '', permit_no: '', validity_date: '',
  driver_name: '', driver_mobile: '',
};

type FormState = typeof EMPTY_FORM;
type FormErrors = Partial<Record<keyof FormState, string>>;

export function VehicleMasterScreen() {
  const [rows, setRows] = useState<VehicleMasterItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<VehicleMasterItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errs, setErrs] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
      owner_name: row.owner_name ?? '',
      owner_mobile: row.owner_mobile ?? '',
      owner_pan: row.owner_pan ?? '',
      chassis_no: row.chassis_no ?? '',
      permit_no: row.permit_no ?? '',
      validity_date: row.validity_date ? String(row.validity_date).slice(0, 10) : '',
      driver_name: row.driver_name ?? '',
      driver_mobile: row.driver_mobile ?? '',
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
    const ownerMobErr = validateMobile(s.owner_mobile);
    if (ownerMobErr) e.owner_mobile = ownerMobErr;
    const ownerPanErr = validatePAN(s.owner_pan);
    if (ownerPanErr) e.owner_pan = ownerPanErr;
    const drvMobErr = validateMobile(s.driver_mobile);
    if (drvMobErr) e.driver_mobile = drvMobErr;
    const dateErr = validateDate(s.validity_date);
    if (dateErr) e.validity_date = dateErr;
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
        owner_mobile: form.owner_mobile.trim() || null,
        owner_pan: form.owner_pan.trim().toUpperCase() || null,
        chassis_no: form.chassis_no.trim().toUpperCase() || null,
        permit_no: form.permit_no.trim() || null,
        validity_date: form.validity_date.trim() || null,
        driver_name: form.driver_name.trim() || null,
        driver_mobile: form.driver_mobile.trim() || null,
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

  const columns: Column<VehicleMasterItem>[] = [
    { key: 'name', label: 'Reg No', width: 150, render: (r) => r.name },
    { key: 'vehicle_type', label: 'Type', width: 120, render: (r) => r.vehicle_type || '—' },
    { key: 'owner_name', label: 'Owner', render: (r) => r.owner_name || '—' },
    { key: 'driver_name', label: 'Driver', width: 160, render: (r) => r.driver_name || '—' },
    {
      key: 'validity_date', label: 'Validity', width: 120,
      render: (r) => (r.validity_date ? String(r.validity_date).slice(0, 10) : '—'),
    },
    {
      key: 'actions', label: '', width: 80, align: 'right',
      render: (r) => (
        <Pressable onPress={() => openEdit(r)} accessibilityRole="button" testID={`edit-vehicle-${r.id}`}>
          <Text style={styles.editAction}>Edit</Text>
        </Pressable>
      ),
    },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Vehicle Master</Text>
        <View style={styles.headerActions}>
          <SyncButton onSync={onSync} testID="sync-vehicle-btn" />
          <View style={styles.newBtn}>
            <ButtonPrimary title="New Vehicle" onPress={openCreate} testID="new-vehicle-btn" />
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

          <Text style={styles.sectionLabel}>Owner</Text>
          <InputField
            label="Owner Name"
            value={form.owner_name}
            onChangeText={(v) => setForm((f) => ({ ...f, owner_name: v }))}
            fieldType="letters"
            testID="vehicle-owner-name-input"
          />
          <View style={styles.row}>
            <View style={styles.rowHalf}>
              <InputField
                label="Owner Mobile"
                value={form.owner_mobile}
                onChangeText={(v) => setForm((f) => ({ ...f, owner_mobile: v }))}
                error={errs.owner_mobile ?? null}
                fieldType="phone"
                testID="vehicle-owner-mobile-input"
              />
            </View>
            <View style={styles.rowHalf}>
              <InputField
                label="Owner PAN"
                value={form.owner_pan}
                onChangeText={(v) => setForm((f) => ({ ...f, owner_pan: v.toUpperCase() }))}
                error={errs.owner_pan ?? null}
                fieldType="alphanumeric"
                autoCapitalize="characters"
                placeholder="AAAAA0000A"
                testID="vehicle-owner-pan-input"
              />
            </View>
          </View>

          <Text style={styles.sectionLabel}>Documents</Text>
          <View style={styles.row}>
            <View style={styles.rowHalf}>
              <InputField
                label="Chassis No"
                value={form.chassis_no}
                onChangeText={(v) => setForm((f) => ({ ...f, chassis_no: v.toUpperCase() }))}
                fieldType="alphanumeric"
                autoCapitalize="characters"
                testID="vehicle-chassis-input"
              />
            </View>
            <View style={styles.rowHalf}>
              <InputField
                label="Permit No"
                value={form.permit_no}
                onChangeText={(v) => setForm((f) => ({ ...f, permit_no: v }))}
                fieldType="alphanumeric"
                testID="vehicle-permit-input"
              />
            </View>
          </View>
          <InputField
            label="Validity Date"
            value={form.validity_date}
            onChangeText={(v) => setForm((f) => ({ ...f, validity_date: v }))}
            error={errs.validity_date ?? null}
            fieldType="date"
            placeholder="YYYY-MM-DD"
            testID="vehicle-validity-input"
          />

          <Text style={styles.sectionLabel}>Driver</Text>
          <View style={styles.row}>
            <View style={styles.rowHalf}>
              <InputField
                label="Driver Name"
                value={form.driver_name}
                onChangeText={(v) => setForm((f) => ({ ...f, driver_name: v }))}
                fieldType="letters"
                testID="vehicle-driver-name-input"
              />
            </View>
            <View style={styles.rowHalf}>
              <InputField
                label="Driver Mobile"
                value={form.driver_mobile}
                onChangeText={(v) => setForm((f) => ({ ...f, driver_mobile: v }))}
                error={errs.driver_mobile ?? null}
                fieldType="phone"
                testID="vehicle-driver-mobile-input"
              />
            </View>
          </View>

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
  sectionLabel: {
    ...text.label,
    fontSize: 13, color: colors.textMuted,
    marginTop: spacing.sm, marginBottom: 4,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
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
});
