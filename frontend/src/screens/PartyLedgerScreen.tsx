/**
 * PartyLedgerScreen — shared screen used by PartyMaster / OwnerMaster / AgentMaster.
 * The three pages have identical fields (name, GST, PAN, address, city, state,
 * country, pincode); only the `type` and labels differ.
 *
 * The `type` column is hidden from the UI but sent to the API on every call so
 * the backend can filter / persist correctly.
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
import { partyLedgerService } from '../services/partyLedgerService';
import {
  validateGST, validatePAN, validatePincode, validateRequired,
} from '../utils/masterValidators';
import type { PartyLedgerItem, PartyLedgerType } from '../../../shared/types/partyLedger';

const EMPTY_FORM = {
  name: '', gst_no: '', pan_no: '',
  address: '', city: '', state: '', country: '', pincode: '',
};

type FormState = typeof EMPTY_FORM;
type FormErrors = Partial<Record<keyof FormState, string>>;

interface Props {
  type: number;
  title: string;
  entityName: string;
}

export function PartyLedgerScreen({ type, title, entityName }: Props) {
  const [rows, setRows] = useState<PartyLedgerItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<PartyLedgerItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errs, setErrs] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setListError(null);
    try {
      const list = await partyLedgerService.list(type);
      setRows(list);
    } catch {
      setListError(`Could not load ${title.toLowerCase()}.`);
      setRows([]);
    }
  }, [type, title]);

  useAutoRefresh(load);

  const openCreate = useCallback(() => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setErrs({});
    setFormError(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((row: PartyLedgerItem) => {
    setEditTarget(row);
    setForm({
      name: row.name ?? '',
      gst_no: row.gst_no ?? '',
      pan_no: row.pan_no ?? '',
      address: row.address ?? '',
      city: row.city ?? '',
      state: row.state ?? '',
      country: row.country ?? '',
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
    const nameErr = validateRequired(s.name, `${entityName} name`);
    if (nameErr) e.name = nameErr;
    const gstErr = validateGST(s.gst_no);
    if (gstErr) e.gst_no = gstErr;
    const panErr = validatePAN(s.pan_no);
    if (panErr) e.pan_no = panErr;
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
        name: form.name.trim(),
        gst_no: form.gst_no.trim().toUpperCase() || null,
        pan_no: form.pan_no.trim().toUpperCase() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        country: form.country.trim() || null,
        pincode: form.pincode.trim() || null,
      };
      if (editTarget) {
        await partyLedgerService.update(editTarget.id, payload);
      } else {
        await partyLedgerService.create({ ...payload, ledger_group_id: type });
      }
      await load();
      closeModal();
    } catch (err: any) {

      const code = err?.response?.data?.error;
      const codeMap: Record<string, string> = {
        invalid_gst: 'Invalid GST format.',
        invalid_pan: 'Invalid PAN format.',
        invalid_pincode: 'Pincode must be 6 digits.',
        invalid_name: `${entityName} name is required.`,
      };
      setFormError(codeMap[code] || 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }, [form, editTarget, load, closeModal, type, entityName]);

  const onSync = async () => {
    await partyLedgerService.sync();
    Alert.alert('Sync complete', 'Tally sync finished.');
    await load();
  };

  const columns: Column<PartyLedgerItem>[] = [
    { key: 'name', label: 'Name', render: (r) => r.name },
    { key: 'gst_no', label: 'GST No', width: 170, render: (r) => r.gst_no || '—' },
    { key: 'pan_no', label: 'PAN', width: 130, render: (r) => r.pan_no || '—' },
    {
      key: 'city', label: 'City / State', width: 200,
      render: (r) => [r.city, r.state].filter(Boolean).join(', ') || '—',
    },
    { key: 'pincode', label: 'Pincode', width: 100, render: (r) => r.pincode || '—' },
    {
      key: 'actions', label: '', width: 80, align: 'right',
      render: (r) => (
        <Pressable onPress={() => openEdit(r)} accessibilityRole="button" testID={`edit-${type}-${r.id}`}>
          <Text style={styles.editAction}>Edit</Text>
        </Pressable>
      ),
    },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerActions}>
          <SyncButton onSync={onSync} testID={`sync-${type}-btn`} />
          <View style={styles.newBtn}>
            <ButtonPrimary
              title={`New ${entityName}`}
              onPress={openCreate}
              testID={`new-${type}-btn`}
            />
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
          <DataTable<PartyLedgerItem>
            columns={columns}
            rows={rows}
            keyExtractor={(r) => r.id}
            emptyLabel={`No entries yet — click New ${entityName} to add one.`}
            testID={`${type}-table`}
          />
        </View>
      )}

      <Modal
        visible={modalOpen}
        onClose={closeModal}
        title={editTarget ? `Edit ${entityName}` : `New ${entityName}`}
        testID={`${type}-modal`}
      >
        <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContent}>
          {formError ? (
            <View style={styles.formError}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}

          <InputField
            label={`${entityName} Name *`}
            value={form.name}
            onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
            error={errs.name ?? null}
            fieldType="letters"
            testID={`${type}-name-input`}
          />
          <InputField
            label="GST No"
            value={form.gst_no}
            onChangeText={(v) => setForm((f) => ({ ...f, gst_no: v.toUpperCase() }))}
            error={errs.gst_no ?? null}
            fieldType="alphanumeric"
            autoCapitalize="characters"
            placeholder="22AAAAA0000A1Z5"
            testID={`${type}-gst-input`}
          />
          <InputField
            label="PAN No"
            value={form.pan_no}
            onChangeText={(v) => setForm((f) => ({ ...f, pan_no: v.toUpperCase() }))}
            error={errs.pan_no ?? null}
            fieldType="alphanumeric"
            autoCapitalize="characters"
            placeholder="AAAAA0000A"
            testID={`${type}-pan-input`}
          />
          <InputField
            label="Address"
            value={form.address}
            onChangeText={(v) => setForm((f) => ({ ...f, address: v }))}
            testID={`${type}-address-input`}
          />
          <View style={styles.row}>
            <View style={styles.rowHalf}>
              <InputField
                label="City"
                value={form.city}
                onChangeText={(v) => setForm((f) => ({ ...f, city: v }))}
                fieldType="letters"
                testID={`${type}-city-input`}
              />
            </View>
            <View style={styles.rowHalf}>
              <InputField
                label="State"
                value={form.state}
                onChangeText={(v) => setForm((f) => ({ ...f, state: v }))}
                fieldType="letters"
                testID={`${type}-state-input`}
              />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.rowHalf}>
              <InputField
                label="Country"
                value={form.country}
                onChangeText={(v) => setForm((f) => ({ ...f, country: v }))}
                fieldType="letters"
                testID={`${type}-country-input`}
              />
            </View>
            <View style={styles.rowHalf}>
              <InputField
                label="Pincode"
                value={form.pincode}
                onChangeText={(v) => setForm((f) => ({ ...f, pincode: v }))}
                error={errs.pincode ?? null}
                fieldType="integer"
                testID={`${type}-pincode-input`}
              />
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable onPress={closeModal} style={styles.cancelBtn} testID={`${type}-cancel-btn`}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <View style={styles.submitWrap}>
              <ButtonPrimary
                title={editTarget ? 'Save changes' : `Create ${entityName.toLowerCase()}`}
                onPress={onSubmit}
                loading={saving}
                testID={`${type}-submit-btn`}
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
  formScroll: { maxHeight: 560 },
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
  submitWrap: { minWidth: 150 },
  editAction: {
    ...text.action, color: colors.primary,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
});
