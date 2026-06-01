/**
 * ZoneMasterScreen — single-name master for the Bilty header's Zone field.
 * Mirrors the ItemGroupScreen / LedgerGroupsScreen pattern.
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
import { zoneService } from '../services/zoneService';
import { validateRequired } from '../utils/masterValidators';
import type { ZoneMasterItem } from '../../../shared/types/zoneMaster';
import { useAuth } from '../context/AuthContext';
import { canDoAction } from '../navigation/guards';

const EMPTY_FORM = { name: '' };
type FormState = typeof EMPTY_FORM;
type FormErrors = Partial<Record<keyof FormState, string>>;

export function ZoneMasterScreen() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ZoneMasterItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ZoneMasterItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errs, setErrs] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<ZoneMasterItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setListError(null);
    try {
      setRows(await zoneService.list());
    } catch {
      setListError('Could not load zones.');
      setRows([]);
    }
  }, []);

  useAutoRefresh(load);

  const visibleRows = useMemo(() => {
    if (!rows) return null;
    const q = search.trim().toLowerCase();
    if (q === '') return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, search]);

  const openCreate = useCallback(() => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setErrs({});
    setFormError(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((row: ZoneMasterItem) => {
    setEditTarget(row);
    setForm({ name: row.name });
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
    const nameErr = validateRequired(s.name, 'Zone name');
    if (nameErr) e.name = nameErr;
    return e;
  };

  const onSubmit = useCallback(async () => {
    const e = validate(form);
    setErrs(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    setFormError(null);
    const body = { name: form.name.trim() };
    try {
      if (editTarget) {
        await zoneService.update(editTarget.id, body);
      } else {
        await zoneService.create(body);
      }
      await load();
      closeModal();
    } catch (err: any) {
      const code = err?.response?.data?.error;
      const codeMap: Record<string, string> = {
        name_taken: 'A zone with that name already exists.',
        invalid_name: 'Zone name is required.',
      };
      setFormError(codeMap[code] || 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }, [form, editTarget, load, closeModal]);

  const onDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await zoneService.remove(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Could not delete the zone.';
      Alert.alert('Cannot delete', msg);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, load]);

  const columns: Column<ZoneMasterItem>[] = [
    {
      key: 'name', label: 'Zone Name',
      render: (r) => <Text style={styles.nameCell}>{r.name}</Text>,
    },
    {
      key: 'actions', label: 'Actions', width: 130, align: 'right',
      render: (r) => (
        <View style={styles.rowActions}>
          {canDoAction(user, 'zonemaster', 'edit') && (
            <Pressable
              onPress={() => openEdit(r)}
              accessibilityRole="button"
              testID={`edit-zone-${r.id}`}
            >
              <Text style={styles.editAction}>Edit</Text>
            </Pressable>
          )}
          {canDoAction(user, 'zonemaster', 'delete') && (
            <Pressable
              onPress={() => setDeleteTarget(r)}
              accessibilityRole="button"
              testID={`delete-zone-${r.id}`}
            >
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
        <Text style={styles.title}>Zone Master</Text>
        <View style={styles.headerActions}>
          {canDoAction(user, 'zonemaster', 'create') && (
            <View style={styles.newBtn}>
              <ButtonPrimary
                title="Create Zone"
                onPress={openCreate}
                testID="new-zone-btn"
              />
            </View>
          )}
        </View>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search zones..."
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          testID="zones-search-input"
        />
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
          <DataTable<ZoneMasterItem>
            columns={columns}
            rows={visibleRows ?? []}
            keyExtractor={(r) => r.id}
            emptyLabel={
              search
                ? `No zones match "${search}".`
                : 'No zones yet — click Create Zone to add one.'
            }
            testID="zones-table"
          />
        </View>
      )}

      <Modal
        visible={modalOpen}
        onClose={closeModal}
        title={editTarget ? 'Edit Zone' : 'Create Zone'}
        testID="zone-modal"
      >
        <View style={styles.formContent}>
          {formError ? (
            <View style={styles.formError}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}

          <InputField
            label="Zone Name *"
            value={form.name}
            onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
            error={errs.name ?? null}
            placeholder="e.g. North"
            testID="zone-name-input"
          />

          <View style={styles.actions}>
            <Pressable onPress={closeModal} style={styles.cancelBtn} testID="zone-cancel-btn">
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <View style={styles.submitWrap}>
              <ButtonPrimary
                title={editTarget ? 'Save changes' : 'Create'}
                onPress={onSubmit}
                loading={saving}
                testID="zone-submit-btn"
              />
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={!!deleteTarget}
        title="Delete zone"
        message={
          deleteTarget
            ? `Delete "${deleteTarget.name}"? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        danger
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={onDelete}
        testID="delete-zone-confirm"
      />
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
  newBtn: { minWidth: 200 },
  searchWrap: { marginBottom: spacing.md, maxWidth: 360 },
  searchInput: {
    height: 40,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    fontSize: 14,
    color: colors.text,
    fontFamily: typography.ui,
  },
  errorBanner: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  errorBannerText: { ...text.label, color: colors.danger },
  tableWrap: { flex: 1, minHeight: 200 },
  nameCell: { color: colors.text, fontFamily: typography.uiBold, fontSize: 14 },
  descCell: { color: colors.text, fontFamily: typography.ui, fontSize: 14 },
  mutedCell: {
    color: colors.textMuted, fontFamily: typography.ui, fontSize: 14,
    fontStyle: 'italic',
  },
  rowActions: {
    flexDirection: 'row', justifyContent: 'flex-end',
    alignItems: 'center', gap: spacing.sm,
  },
  editAction: {
    ...text.action, color: colors.primary,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  deleteAction: {
    ...text.action, color: colors.danger,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  formContent: { paddingBottom: spacing.sm, gap: spacing.md },
  formError: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.danger,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  formErrorText: { ...text.label, color: colors.danger },
  actions: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'flex-end', marginTop: spacing.md, gap: spacing.sm,
  },
  cancelBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  cancelBtnText: { ...text.action, color: colors.textMuted, fontSize: 14 },
  submitWrap: { minWidth: 150 },
});
