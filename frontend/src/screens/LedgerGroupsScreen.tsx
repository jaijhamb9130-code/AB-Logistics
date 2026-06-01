/**
 * LedgerGroupsScreen — Tally-style chart-of-accounts admin page.
 *
 * Table columns: S.No · Ledger Name · Parent · Actions (Edit / Delete).
 * Parent shown italic as "Primary" when null. The 3 system groups
 * (Party / Owner / Agent — ids 1/2/3) cannot be deleted.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { ButtonPrimary } from '../components/ButtonPrimary';
import { DataTable, type Column } from '../components/DataTable';
import { InputField } from '../components/InputField';
import { Loader } from '../components/Loader';
import { Modal } from '../components/Modal';
import { AutocompleteField } from '../components/AutocompleteField';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { colors, radius, spacing, text, typography } from '../constants/theme';
import { ledgerGroupService } from '../services/ledgerGroupService';
import { ledgerMasterService } from '../services/ledgerMasterService';
import { validateRequired } from '../utils/masterValidators';
import type { LedgerGroupItem } from '../../../shared/types/ledgerGroup';
import { useAuth } from '../context/AuthContext';
import { canDoAction } from '../navigation/guards';

// Accounting-standard groups that the user shouldn't delete by accident.
// Compared by name so the protection survives id reshuffles.
const SYSTEM_GROUP_NAMES = new Set<string>([
  'Sales Accounts',
  'Purchase Accounts',
  'Duties & Taxes',
  'Indirect Income',
  'Bank Accounts',
  'Cash-in-Hand',
  'Direct Expenses',
  'Sundry Debtors',
]);

const EMPTY_FORM = { group_name: '', parent_name: '' };
type FormState = typeof EMPTY_FORM;
type FormErrors = Partial<Record<keyof FormState, string>>;

export function LedgerGroupsScreen() {
  const { user } = useAuth();
  const [rows, setRows] = useState<LedgerGroupItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<LedgerGroupItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errs, setErrs] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<LedgerGroupItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setListError(null);
    try {
      setRows(await ledgerGroupService.list());
    } catch {
      setListError('Could not load ledger groups.');
      setRows([]);
    }
  }, []);

  useAutoRefresh(load);

  // Filter table rows by the search box (case-insensitive substring match).
  const visibleRows = useMemo(() => {
    if (!rows) return null;
    const q = search.trim().toLowerCase();
    if (q === '') return rows;
    return rows.filter((r) => r.group_name.toLowerCase().includes(q));
  }, [rows, search]);

  // All group names — fed into the parent autocomplete inside the form.
  // When editing, exclude the row itself so it can't pick itself as parent.
  const parentOptions = useMemo(() => {
    if (!rows) return [];
    const excludeId = editTarget?.id;
    return rows
      .filter((r) => r.id !== excludeId)
      .map((r) => r.group_name)
      .sort();
  }, [rows, editTarget]);

  const [ledgerMasterOptions, setLedgerMasterOptions] = useState<string[]>([]);

  useEffect(() => {
    if (form.group_name.length >= 3) {
      ledgerMasterService.search(undefined, form.group_name)
        .then(res => {
          setLedgerMasterOptions(res.map(r => r.name));
        })
        .catch(() => { });
    } else {
      setLedgerMasterOptions([]);
    }
  }, [form.group_name]);

  const openCreate = useCallback(() => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setErrs({});
    setFormError(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((row: LedgerGroupItem) => {
    setEditTarget(row);
    setForm({
      group_name: row.group_name,
      parent_name: row.parent_name ?? '',
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
    const nameErr = validateRequired(s.group_name, 'Ledger name');
    if (nameErr) e.group_name = nameErr;
    return e;
  };

  const onSubmit = useCallback(async () => {
    const e = validate(form);
    setErrs(e);
    if (Object.keys(e).length > 0) return;

    // Resolve parent name → id by looking it up in the loaded rows.
    let parent_id: number | null = null;
    const trimmedParent = form.parent_name.trim();
    if (trimmedParent !== '') {
      const match = rows?.find(
        (r) => r.group_name.toLowerCase() === trimmedParent.toLowerCase()
      );
      if (!match) {
        setFormError(`Parent "${trimmedParent}" doesn't exist. Pick from the dropdown or leave blank for Primary.`);
        return;
      }
      if (editTarget && match.id === editTarget.id) {
        setFormError('A group cannot be its own parent.');
        return;
      }
      parent_id = match.id;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editTarget) {
        await ledgerGroupService.update(editTarget.id, { group_name: form.group_name.trim(), parent_id });
      } else {
        await ledgerGroupService.create({ group_name: form.group_name.trim(), parent_id });
      }
      await load();
      closeModal();
    } catch (err: any) {
      const code = err?.response?.data?.error;
      const serverMessage = err?.response?.data?.message;
      // Prefer the server's specific message when it includes the conflicting
      // name (e.g. "Group 'Owner' already exists. Pick a different name.").
      const codeMap: Record<string, string> = {
        name_taken: 'A ledger group with that name already exists.',
        invalid_name: 'Ledger name is required.',
        parent_not_found: 'The selected parent group no longer exists.',
        cannot_be_self_parent: 'A group cannot be its own parent.',
      };
      setFormError(serverMessage || codeMap[code] || 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }, [form, editTarget, rows, load, closeModal]);

  const onDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await ledgerGroupService.remove(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      const msg = err?.response?.data?.message
        || 'Could not delete the group.';
      Alert.alert('Cannot delete', msg);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, load]);

  const columns: Column<LedgerGroupItem>[] = [
    // DataTable already prepends an auto S.No column, so we don't add one here.
    {
      key: 'group_name', label: 'Ledger Name',
      render: (r) => <Text style={styles.nameCell}>{r.group_name}</Text>,
    },
    {
      key: 'parent', label: 'Parent', width: 220,
      render: (r) => r.parent_name
        ? <Text style={styles.parentCell}>{r.parent_name}</Text>
        : <Text style={styles.primaryCell}>Primary</Text>,
    },
    {
      key: 'actions', label: 'Actions', width: 130, align: 'right',
      render: (r) => {
        const isSystem = SYSTEM_GROUP_NAMES.has(r.group_name);
        return (
          <View style={styles.rowActions}>
            {canDoAction(user, 'ledgergroup', 'edit') && (
              <Pressable
                onPress={() => openEdit(r)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${r.group_name}`}
                testID={`edit-group-${r.id}`}
              >
                <Text style={styles.editAction}>Edit</Text>
              </Pressable>
            )}
            {canDoAction(user, 'ledgergroup', 'delete') && (
              <Pressable
                onPress={() => !isSystem && setDeleteTarget(r)}
                disabled={isSystem}
                accessibilityRole="button"
                accessibilityLabel={
                  isSystem
                    ? `${r.group_name} is a system group and cannot be deleted`
                    : `Delete ${r.group_name}`
                }
                accessibilityState={{ disabled: isSystem }}
                testID={`delete-group-${r.id}`}
              >
                <Text style={[styles.deleteAction, isSystem && styles.actionDisabled]}>
                  Delete
                </Text>
              </Pressable>
            )}
          </View>
        );
      },
    },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Ledger Groups</Text>
        <View style={styles.headerActions}>
          {canDoAction(user, 'ledgergroup', 'create') && (
            <View style={styles.newBtn}>
              <ButtonPrimary
                title="Create Ledger Group"
                onPress={openCreate}
                testID="new-ledger-group-btn"
              />
            </View>
          )}
        </View>
      </View>

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search ledger groups..."
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          testID="ledger-groups-search-input"
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
          <DataTable<LedgerGroupItem>
            columns={columns}
            rows={visibleRows ?? []}
            keyExtractor={(r) => r.id}
            emptyLabel={
              search
                ? `No groups match "${search}".`
                : 'No ledger groups yet — click Create Ledger Group to add one.'
            }
            testID="ledger-groups-table"
          />
        </View>
      )}

      {/* ---- Create / Edit modal ---- */}
      <Modal
        visible={modalOpen}
        onClose={closeModal}
        title={editTarget ? 'Edit Ledger Group' : 'Create Ledger Group'}
        testID="ledger-group-modal"
      >
        <View style={[styles.formScroll, styles.formContent, { zIndex: 10 }]}>
          {formError ? (
            <View style={styles.formError}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}

          <AutocompleteField
            label="Ledger Name *"
            value={form.group_name}
            options={ledgerMasterOptions}
            onChangeText={(v) => setForm((f) => ({ ...f, group_name: v }))}
            error={errs.group_name ?? null}
            placeholder="e.g. Sundry Debtors"
            testID="ledger-group-name-input"
          />

          <AutocompleteField
            label="Parent Group"
            value={form.parent_name}
            options={parentOptions}
            onChangeText={(v) => setForm((f) => ({ ...f, parent_name: v }))}
            placeholder="(leave blank for Primary)"
            testID="ledger-group-parent-input"
          />

          <View style={styles.actions}>
            <Pressable onPress={closeModal} style={styles.cancelBtn} testID="ledger-group-cancel-btn">
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <View style={styles.submitWrap}>
              <ButtonPrimary
                title={editTarget ? 'Save changes' : 'Create'}
                onPress={onSubmit}
                loading={saving}
                testID="ledger-group-submit-btn"
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ---- Delete confirm ---- */}
      <ConfirmDialog
        visible={!!deleteTarget}
        title="Delete ledger group"
        message={
          deleteTarget
            ? `Delete "${deleteTarget.group_name}"? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        danger
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={onDelete}
        testID="delete-ledger-group-confirm"
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
  srNo: { color: colors.textMuted, fontFamily: typography.mono, fontSize: 14 },
  nameCell: { color: colors.text, fontFamily: typography.uiBold, fontSize: 14 },
  parentCell: { color: colors.text, fontFamily: typography.ui, fontSize: 14 },
  primaryCell: {
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
  actionDisabled: { color: colors.textMuted, opacity: 0.4 },
  formScroll: { maxHeight: 420 },
  formContent: { paddingBottom: spacing.sm },
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
