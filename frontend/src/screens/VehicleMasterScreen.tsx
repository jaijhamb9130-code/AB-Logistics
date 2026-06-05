/**
 * VehicleMasterScreen — the central truck + owner master. Each row is the
 * CURRENT owner-version of a vehicle number; owner details live on the record.
 *
 * Editing pops a "Maintain vs Create" chooser:
 *   • Maintain — update the current record in place (normal edit).
 *   • Create   — keep history: add a NEW current owner-version against the same
 *                vehicle number (used when the truck changes hands). Wherever the
 *                owner name is read, the latest version is the live owner.
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
import { colors, radius, spacing, text, typography } from '../constants/theme';
import { vehicleMasterService } from '../services/vehicleMasterService';
import { ledgerGroupService } from '../services/ledgerGroupService';
import { validateRequired } from '../utils/masterValidators';
import type { VehicleMasterItem } from '../../../shared/types/vehicleMaster';
import { useAuth } from '../context/AuthContext';
import { canDoAction } from '../navigation/guards';

const EMPTY_FORM = {
  name: '', vehicle_type: '', ledger_group: '',
  mobile: '', gst_no: '', pan_no: '',
  address: '', city: '', state: '', pincode: '',
};

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
  const [ledgerGroupOptions, setLedgerGroupOptions] = useState<string[]>([]);
  // Edit-time "Maintain vs Create" chooser.
  const [chooserOpen, setChooserOpen] = useState(false);

  // Ledger group names feed the "Ledger Group" dropdown.
  useEffect(() => {
    ledgerGroupService.list()
      .then((rs) => setLedgerGroupOptions(rs.map((r) => r.group_name).sort()))
      .catch(() => setLedgerGroupOptions([]));
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
      ledger_group: row.ledger_group ?? '',
      mobile: row.mobile ?? '',
      gst_no: row.gst_no ?? '',
      pan_no: row.pan_no ?? '',
      address: row.address ?? '',
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
    setChooserOpen(false);
  }, []);

  const validate = (s: FormState): FormErrors => {
    const e: FormErrors = {};
    const nameErr = validateRequired(s.name, 'Vehicle number');
    if (nameErr) e.name = nameErr;
    // Owner Name IS the picked ledger group (the group's name is the owner).
    const ownerErr = validateRequired(s.ledger_group, 'Owner name');
    if (ownerErr) e.ledger_group = ownerErr;
    return e;
  };

  const buildPayload = () => ({
    name: form.name.trim().toUpperCase(),
    vehicle_type: form.vehicle_type.trim() || null,
    ledger_group: form.ledger_group.trim() || null,
    mobile: form.mobile.trim() || null,
    gst_no: form.gst_no.trim().toUpperCase() || null,
    pan_no: form.pan_no.trim().toUpperCase() || null,
    address: form.address.trim() || null,
    city: form.city.trim() || null,
    state: form.state.trim() || null,
    pincode: form.pincode.trim() || null,
  });

  // Create (new vehicle) saves immediately; edit opens the Maintain/Create chooser.
  const onSubmit = useCallback(() => {
    const e = validate(form);
    setErrs(e);
    if (Object.keys(e).length > 0) return;
    // Edit → close the form modal first, THEN open the Maintain/Create chooser.
    // Never stack two modals: react-native-web traps focus in the first one,
    // which would make the chooser's buttons unclickable.
    if (editTarget) { setModalOpen(false); setChooserOpen(true); return; }
    void doSave(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, editTarget]);

  const doSave = useCallback(async (mode: 'maintain' | 'create' | null) => {
    setChooserOpen(false);
    setSaving(true);
    setFormError(null);
    try {
      const payload = buildPayload();
      if (editTarget && mode) {
        await vehicleMasterService.update(editTarget.id, { ...payload, mode });
      } else {
        await vehicleMasterService.create(payload);
      }
      await load();
      closeModal();
    } catch (err: any) {
      const code = err?.response?.data?.error;
      if (code === 'name_taken') setFormError('A vehicle with that number already exists.');
      else setFormError('Could not save vehicle. Try again.');
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTarget, form, load, closeModal]);

  const onDelete = useCallback(
    async (row: VehicleMasterItem) => {
      const ok =
        typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm(`Delete "${row.name}" and all its owner history? This cannot be undone.`)
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
        if (typeof window !== 'undefined' && typeof window.alert === 'function') window.alert(message);
        else Alert.alert('Delete failed', message);
      }
    },
    [load],
  );

  const columns: Column<VehicleMasterItem>[] = [
    { key: 'name', label: 'Vehicle No', render: (r) => r.name },
    // Owner Name = the picked ledger group's name (the owner IS the group).
    { key: 'owner_name', label: 'Owner Name', render: (r) => r.owner_name || r.ledger_group || '—' },
    { key: 'mobile', label: 'Mobile', render: (r) => r.mobile || '—' },
    { key: 'gst_no', label: 'GST No', render: (r) => r.gst_no || '—' },
    { key: 'city', label: 'City', render: (r) => r.city || '—' },
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
                label="Vehicle Number *"
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v.toUpperCase() }))}
                error={errs.name ?? null}
                fieldType="alphanumeric"
                autoCapitalize="characters"
                placeholder=""
                inputStyle={styles.valueText}
                testID="vehicle-name-input"
              />
            </View>
            <View style={styles.rowHalf}>
              <InputField
                label="Vehicle Type"
                value={form.vehicle_type}
                onChangeText={(v) => setForm((f) => ({ ...f, vehicle_type: v }))}
                placeholder=""
                inputStyle={styles.valueText}
                testID="vehicle-type-input"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.rowHalf}>
              <AutocompleteField
                label="Owner Name *"
                value={form.ledger_group}
                options={ledgerGroupOptions}
                onChangeText={(v) => setForm((f) => ({ ...f, ledger_group: v }))}
                error={errs.ledger_group ?? null}
                placeholder=""
                inputStyle={styles.valueText}
                testID="vehicle-owner-input"
              />
            </View>
            <View style={styles.rowHalf}>
              <InputField
                label="Mobile"
                value={form.mobile}
                onChangeText={(v) => setForm((f) => ({ ...f, mobile: v }))}
                fieldType="phone"
                placeholder=""
                inputStyle={styles.valueText}
                testID="vehicle-mobile-input"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.rowHalf}>
              <InputField
                label="GST No"
                value={form.gst_no}
                onChangeText={(v) => setForm((f) => ({ ...f, gst_no: v.toUpperCase() }))}
                autoCapitalize="characters"
                placeholder=""
                inputStyle={styles.valueText}
                testID="vehicle-gst-input"
              />
            </View>
            <View style={styles.rowHalf}>
              <InputField
                label="PAN No"
                value={form.pan_no}
                onChangeText={(v) => setForm((f) => ({ ...f, pan_no: v.toUpperCase() }))}
                autoCapitalize="characters"
                placeholder=""
                inputStyle={styles.valueText}
                testID="vehicle-pan-input"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.rowHalf}>
              <InputField
                label="Address"
                value={form.address}
                onChangeText={(v) => setForm((f) => ({ ...f, address: v }))}
                placeholder=""
                inputStyle={styles.valueText}
                testID="vehicle-address-input"
              />
            </View>
            <View style={styles.rowHalf}>
              <InputField
                label="City"
                value={form.city}
                onChangeText={(v) => setForm((f) => ({ ...f, city: v }))}
                placeholder=""
                inputStyle={styles.valueText}
                testID="vehicle-city-input"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.rowHalf}>
              <InputField
                label="State"
                value={form.state}
                onChangeText={(v) => setForm((f) => ({ ...f, state: v }))}
                placeholder=""
                inputStyle={styles.valueText}
                testID="vehicle-state-input"
              />
            </View>
            <View style={styles.rowHalf}>
              <InputField
                label="Pincode"
                value={form.pincode}
                onChangeText={(v) => setForm((f) => ({ ...f, pincode: v }))}
                fieldType="integer"
                placeholder=""
                inputStyle={styles.valueText}
                testID="vehicle-pincode-input"
              />
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable onPress={closeModal} style={styles.cancelBtn} testID="vehicle-cancel-btn">
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <View style={styles.submitWrap}>
              <ButtonPrimary
                title={editTarget ? 'Save' : 'Create vehicle'}
                onPress={onSubmit}
                loading={saving && !chooserOpen}
                testID="vehicle-submit-btn"
              />
            </View>
          </View>
        </ScrollView>
      </Modal>

      {/* Maintain vs Create chooser (edit only). */}
      <Modal
        visible={chooserOpen}
        onClose={() => { setChooserOpen(false); setModalOpen(true); }}
        title="Save vehicle"
        testID="vehicle-save-chooser"
      >
        <View style={styles.chooserBody}>
          <Text style={styles.chooserText}>
            How should this change be saved?
          </Text>
          <Pressable style={styles.chooserOption} onPress={() => doSave('maintain')} testID="vehicle-save-maintain">
            <Text style={styles.chooserOptionTitle}>Maintain</Text>
            <Text style={styles.chooserOptionDesc}>Update this record in place (normal edit).</Text>
          </Pressable>
          <Pressable style={styles.chooserOption} onPress={() => doSave('create')} testID="vehicle-save-create">
            <Text style={styles.chooserOptionTitle}>Create</Text>
            <Text style={styles.chooserOptionDesc}>
              Keep history — add a new current owner for this same vehicle number (e.g. it changed hands).
            </Text>
          </Pressable>
          <View style={styles.actions}>
            <Pressable onPress={() => { setChooserOpen(false); setModalOpen(true); }} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
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
  rowThird: { flex: 1 },
  // Larger, bold value text so entries read clearly (placeholders removed).
  valueText: { fontSize: 16, lineHeight: 22, fontFamily: typography.uiBold, color: colors.text },
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
  chooserBody: { padding: spacing.md, gap: spacing.sm },
  chooserText: { ...text.label, color: colors.text, marginBottom: spacing.xs },
  chooserOption: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    padding: spacing.md, gap: 4,
  },
  chooserOptionTitle: { ...text.action, color: colors.primary, fontSize: 15 },
  chooserOptionDesc: { ...text.label, color: colors.textMuted, fontSize: 12, lineHeight: 17 },
});
