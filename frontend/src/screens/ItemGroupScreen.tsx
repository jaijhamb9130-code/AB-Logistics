/**
 * ItemGroupScreen — hierarchical Item Group master.
 *
 * Mirrors LedgerGroupsScreen: search bar, table (S.No · Group Name · Parent ·
 * Edit/Delete), Create modal with Name + Parent autocomplete. Parent is
 * rendered italic "Primary" when null.
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
import { AutocompleteField } from '../components/AutocompleteField';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { colors, radius, spacing, text, typography } from '../constants/theme';
import { itemGroupService } from '../services/itemGroupService';
import { validateRequired } from '../utils/masterValidators';
import type { ItemGroupItem } from '../../../shared/types/itemGroup';
import { useAuth } from '../context/AuthContext';
import { canDoAction } from '../navigation/guards';

const EMPTY_FORM = { group_name: '', parent_name: '' };
type FormState = typeof EMPTY_FORM;
type FormErrors = Partial<Record<keyof FormState, string>>;

export function ItemGroupScreen() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ItemGroupItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ItemGroupItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errs, setErrs] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<ItemGroupItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setListError(null);
    try {
      setRows(await itemGroupService.list());
    } catch {
      setListError('Could not load item groups.');
      setRows([]);
    }
  }, []);

  useAutoRefresh(load);

  const visibleRows = useMemo(() => {
    if (!rows) return null;
    const q = search.trim().toLowerCase();
    if (q === '') return rows;
    return rows.filter((r) => r.group_name.toLowerCase().includes(q));
  }, [rows, search]);

  const parentOptions = useMemo(() => {
    if (!rows) return [];
    const excludeId = editTarget?.id;
    return rows
      .filter((r) => r.id !== excludeId)
      .map((r) => r.group_name)
      .sort();
  }, [rows, editTarget]);

  const openCreate = useCallback(() => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setErrs({});
    setFormError(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((row: ItemGroupItem) => {
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
    const nameErr = validateRequired(s.group_name, 'Group name');
    if (nameErr) e.group_name = nameErr;
    return e;
  };

  const onSubmit = useCallback(async () => {
    const e = validate(form);
    setErrs(e);
    if (Object.keys(e).length > 0) return;

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
        await itemGroupService.update(editTarget.id, { group_name: form.group_name.trim(), parent_id });
      } else {
        await itemGroupService.create({ group_name: form.group_name.trim(), parent_id });
      }
      await load();
      closeModal();
    } catch (err: any) {
      const code = err?.response?.data?.error;
      const codeMap: Record<string, string> = {
        name_taken: 'An item group with that name already exists.',
        invalid_name: 'Group name is required.',
        parent_not_found: 'The selected parent group no longer exists.',
        cannot_be_self_parent: 'A group cannot be its own parent.',
      };
      setFormError(codeMap[code] || 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  }, [form, editTarget, rows, load, closeModal]);

  const onDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await itemGroupService.remove(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Could not delete the group.';
      Alert.alert('Cannot delete', msg);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, load]);

  const columns: Column<ItemGroupItem>[] = [
    {
      key: 'group_name', label: 'Group Name',
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
      render: (r) => (
        <View style={styles.rowActions}>
          {canDoAction(user, 'itemgroup', 'edit') && (
            <Pressable
              onPress={() => openEdit(r)}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${r.group_name}`}
              testID={`edit-item-group-${r.id}`}
            >
              <Text style={styles.editAction}>Edit</Text>
            </Pressable>
          )}
          {canDoAction(user, 'itemgroup', 'delete') && (
            <Pressable
              onPress={() => setDeleteTarget(r)}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${r.group_name}`}
              testID={`delete-item-group-${r.id}`}
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
        <Text style={styles.title}>Item Groups</Text>
        <View style={styles.headerActions}>
          {canDoAction(user, 'itemgroup', 'create') && (
            <View style={styles.newBtn}>
              <ButtonPrimary
                title="Create Group"
                onPress={openCreate}
                testID="new-item-group-btn"
              />
            </View>
          )}
        </View>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search item groups..."
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          testID="item-groups-search-input"
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
          <DataTable<ItemGroupItem>
            columns={columns}
            rows={visibleRows ?? []}
            keyExtractor={(r) => r.id}
            emptyLabel={
              search
                ? `No groups match "${search}".`
                : 'No item groups yet — click Create Group to add one.'
            }
            testID="item-groups-table"
          />
        </View>
      )}

      <Modal
        visible={modalOpen}
        onClose={closeModal}
        title={editTarget ? 'Edit Item Group' : 'Create Item Group'}
        testID="item-group-modal"
      >
        <View style={[styles.formScroll, styles.formContent, { zIndex: 10 }]}>
          {formError ? (
            <View style={styles.formError}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}

          <AutocompleteField
            label="Group Name *"
            value={form.group_name}
            options={[]}
            onChangeText={(v) => setForm((f) => ({ ...f, group_name: v }))}
            error={errs.group_name ?? null}
            placeholder="e.g. Electronics"
            testID="item-group-name-input"
          />

          <AutocompleteField
            label="Parent Group"
            value={form.parent_name}
            options={parentOptions}
            onChangeText={(v) => setForm((f) => ({ ...f, parent_name: v }))}
            placeholder="Type to search... (leave blank for Primary)"
            testID="item-group-parent-input"
          />

          <View style={styles.actions}>
            <Pressable onPress={closeModal} style={styles.cancelBtn} testID="item-group-cancel-btn">
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <View style={styles.submitWrap}>
              <ButtonPrimary
                title={editTarget ? 'Save changes' : 'Create'}
                onPress={onSubmit}
                loading={saving}
                testID="item-group-submit-btn"
              />
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={!!deleteTarget}
        title="Delete item group"
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
        testID="delete-item-group-confirm"
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
