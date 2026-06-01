/**
 * AgentMasterScreen — dedicated CRUD page backed by `agent_master` table.
 * Adds a commission_pct field that owners don't have.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { ButtonPrimary } from '../components/ButtonPrimary';
import { DataTable, type Column } from '../components/DataTable';
import { Loader } from '../components/Loader';
import { Modal } from '../components/Modal';
import { InputField } from '../components/InputField';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { colors, radius, spacing, text, typography } from '../constants/theme';
import { agentService } from '../services/agentService';
import {
  validateGST, validatePAN, validateMobile, validatePincode, validateRequired,
} from '../utils/masterValidators';
import type { AgentMasterItem } from '../../../shared/types/agentMaster';
import { useAuth } from '../context/AuthContext';
import { canDoAction } from '../navigation/guards';

const EMPTY_FORM = {
  name: '', mobile: '', gst_no: '', pan_no: '',
  address: '', city: '', state: '', pincode: '',
  commission_pct: '',
};
type FormState = typeof EMPTY_FORM;
type FormErrors = Partial<Record<keyof FormState, string>>;

export function AgentMasterScreen() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AgentMasterItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AgentMasterItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errs, setErrs] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<AgentMasterItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setListError(null);
    try { setRows(await agentService.list()); }
    catch { setListError('Could not load agents.'); setRows([]); }
  }, []);

  useAutoRefresh(load);

  const visibleRows = useMemo(() => {
    if (!rows) return null;
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || (r.mobile || '').includes(q));
  }, [rows, search]);

  const openCreate = useCallback(() => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setErrs({});
    setFormError(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((row: AgentMasterItem) => {
    setEditTarget(row);
    setForm({
      name: row.name ?? '',
      mobile: row.mobile ?? '',
      gst_no: row.gst_no ?? '',
      pan_no: row.pan_no ?? '',
      address: row.address ?? '',
      city: row.city ?? '',
      state: row.state ?? '',
      pincode: row.pincode ?? '',
      commission_pct: row.commission_pct != null ? String(row.commission_pct) : '',
    });
    setErrs({});
    setFormError(null);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => { setModalOpen(false); setEditTarget(null); }, []);

  const validate = (s: FormState): FormErrors => {
    const e: FormErrors = {};
    const nameErr = validateRequired(s.name, 'Agent name'); if (nameErr) e.name = nameErr;
    const mobErr = validateMobile(s.mobile); if (mobErr) e.mobile = mobErr;
    const gstErr = validateGST(s.gst_no); if (gstErr) e.gst_no = gstErr;
    const panErr = validatePAN(s.pan_no); if (panErr) e.pan_no = panErr;
    const pincodeErr = validatePincode(s.pincode); if (pincodeErr) e.pincode = pincodeErr;
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
        mobile: form.mobile.trim() || null,
        gst_no: form.gst_no.trim().toUpperCase() || null,
        pan_no: form.pan_no.trim().toUpperCase() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        pincode: form.pincode.trim() || null,
        commission_pct: form.commission_pct.trim() === '' ? 0 : Number(form.commission_pct),
      };
      if (editTarget) await agentService.update(editTarget.id, payload);
      else await agentService.create(payload);
      await load();
      closeModal();
    } catch (err: any) {
      const code = err?.response?.data?.error;
      if (code === 'name_taken') setFormError('An agent with that name already exists.');
      else setFormError('Could not save agent. Try again.');
    } finally {
      setSaving(false);
    }
  }, [form, editTarget, load, closeModal]);

  const onDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await agentService.remove(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      Alert.alert('Cannot delete', err?.response?.data?.message || 'Could not delete the agent.');
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, load]);

  const columns: Column<AgentMasterItem>[] = [
    { key: 'name', label: 'Name', render: (r) => <Text style={styles.nameCell}>{r.name}</Text> },
    { key: 'mobile', label: 'Mobile', width: 140, render: (r) => r.mobile || '—' },
    { key: 'commission_pct', label: 'Comm %', width: 100, align: 'right',
      render: (r) => r.commission_pct != null ? `${r.commission_pct}%` : '—' },
    { key: 'gst_no', label: 'GST No', width: 180, render: (r) => r.gst_no || '—' },
    {
      key: 'actions', label: '', width: 130, align: 'right',
      render: (r) => (
        <View style={styles.rowActions}>
          {canDoAction(user, 'agentmaster', 'edit') && (
            <Pressable onPress={() => openEdit(r)} testID={`edit-agent-${r.id}`}><Text style={styles.editAction}>Edit</Text></Pressable>
          )}
          {canDoAction(user, 'agentmaster', 'delete') && (
            <Pressable onPress={() => setDeleteTarget(r)} testID={`delete-agent-${r.id}`}><Text style={styles.deleteAction}>Delete</Text></Pressable>
          )}
        </View>
      ),
    },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Agent Master</Text>
        {canDoAction(user, 'agentmaster', 'create') && (
          <View style={styles.newBtn}><ButtonPrimary title="New Agent" onPress={openCreate} testID="new-agent-btn" /></View>
        )}
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search agents..."
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          testID="agent-search-input"
        />
      </View>

      {listError ? <View style={styles.errorBanner}><Text style={styles.errorBannerText}>{listError}</Text></View> : null}

      {rows === null ? (
        <Loader />
      ) : (
        <View style={styles.tableWrap}>
          <DataTable<AgentMasterItem>
            columns={columns}
            rows={visibleRows ?? []}
            keyExtractor={(r) => r.id}
            emptyLabel={search ? `No agents match "${search}".` : 'No agents yet — click New Agent to add one.'}
            testID="agents-table"
          />
        </View>
      )}

      <Modal visible={modalOpen} onClose={closeModal} title={editTarget ? `Edit ${editTarget.name}` : 'New Agent'} testID="agent-modal">
        <View style={styles.formContent}>
          {formError ? <View style={styles.formError}><Text style={styles.formErrorText}>{formError}</Text></View> : null}

          <View style={styles.row}>
            <View style={styles.rowHalf}><InputField label="Agent Name *" value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} error={errs.name ?? null} testID="agent-name-input" /></View>
            <View style={styles.rowHalf}><InputField label="Mobile" value={form.mobile} onChangeText={(v) => setForm((f) => ({ ...f, mobile: v }))} error={errs.mobile ?? null} fieldType="phone" testID="agent-mobile-input" /></View>
          </View>
          <View style={styles.row}>
            <View style={styles.rowHalf}><InputField label="GST No" value={form.gst_no} onChangeText={(v) => setForm((f) => ({ ...f, gst_no: v.toUpperCase() }))} error={errs.gst_no ?? null} fieldType="alphanumeric" autoCapitalize="characters" placeholder="22AAAAA0000A1Z5" testID="agent-gst-input" /></View>
            <View style={styles.rowHalf}><InputField label="PAN No" value={form.pan_no} onChangeText={(v) => setForm((f) => ({ ...f, pan_no: v.toUpperCase() }))} error={errs.pan_no ?? null} fieldType="alphanumeric" autoCapitalize="characters" placeholder="AAAAA0000A" testID="agent-pan-input" /></View>
          </View>
          <InputField label="Address" value={form.address} onChangeText={(v) => setForm((f) => ({ ...f, address: v }))} testID="agent-address-input" />
          <View style={styles.row}>
            <View style={styles.rowThird}><InputField label="City" value={form.city} onChangeText={(v) => setForm((f) => ({ ...f, city: v }))} testID="agent-city-input" /></View>
            <View style={styles.rowThird}><InputField label="State" value={form.state} onChangeText={(v) => setForm((f) => ({ ...f, state: v }))} testID="agent-state-input" /></View>
            <View style={styles.rowThird}><InputField label="Pincode" value={form.pincode} onChangeText={(v) => setForm((f) => ({ ...f, pincode: v }))} error={errs.pincode ?? null} fieldType="integer" testID="agent-pincode-input" /></View>
          </View>
          <InputField label="Commission %" value={form.commission_pct} onChangeText={(v) => setForm((f) => ({ ...f, commission_pct: v }))} fieldType="decimal" placeholder="e.g. 2.5" testID="agent-commission-input" />

          <View style={styles.actions}>
            <Pressable onPress={closeModal} style={styles.cancelBtn} testID="agent-cancel-btn"><Text style={styles.cancelBtnText}>Cancel</Text></Pressable>
            <View style={styles.submitWrap}><ButtonPrimary title={editTarget ? 'Save changes' : 'Create agent'} onPress={onSubmit} loading={saving} testID="agent-submit-btn" /></View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={!!deleteTarget}
        title="Delete agent"
        message={deleteTarget ? `Delete "${deleteTarget.name}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        danger
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={onDelete}
        testID="delete-agent-confirm"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  title: { ...text.heading, fontSize: 24, lineHeight: 32 },
  newBtn: { minWidth: 180 },
  searchWrap: { marginBottom: spacing.md, maxWidth: 360 },
  searchInput: {
    height: 40, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, backgroundColor: colors.card, fontSize: 14, color: colors.text, fontFamily: typography.ui,
  },
  errorBanner: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  errorBannerText: { ...text.label, color: colors.danger },
  tableWrap: { flex: 1, minHeight: 200 },
  nameCell: { color: colors.text, fontFamily: typography.uiBold, fontSize: 14 },
  rowActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.sm },
  editAction: { ...text.action, color: colors.primary, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  deleteAction: { ...text.action, color: colors.danger, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  formContent: { paddingBottom: spacing.sm, gap: spacing.sm },
  formError: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  formErrorText: { ...text.label, color: colors.danger },
  row: { flexDirection: 'row', gap: spacing.sm },
  rowHalf: { flex: 1 },
  rowThird: { flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: spacing.md, gap: spacing.sm },
  cancelBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  cancelBtnText: { ...text.action, color: colors.textMuted, fontSize: 14 },
  submitWrap: { minWidth: 150 },
});
