/**
 * ItemCategoryScreen — hierarchical Item Category master.
 *
 * Mirrors LedgerGroupsScreen / ItemGroupScreen: search bar, table, Create
 * modal with Name + Parent autocomplete. Parent rendered italic "Primary"
 * when null.
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
import { itemCategoryService } from '../services/itemCategoryService';
import { validateRequired } from '../utils/masterValidators';
import type { ItemCategoryItem } from '../../../shared/types/itemCategory';
import { useAuth } from '../context/AuthContext';
import { canDoAction } from '../navigation/guards';

const EMPTY_FORM = { category_name: '', parent_name: '' };
type FormState = typeof EMPTY_FORM;
type FormErrors = Partial<Record<keyof FormState, string>>;

export function ItemCategoryScreen() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ItemCategoryItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ItemCategoryItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errs, setErrs] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<ItemCategoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setListError(null);
    try {
      setRows(await itemCategoryService.list());
    } catch {
      setListError('Could not load item categories.');
      setRows([]);
    }
  }, []);

  useAutoRefresh(load);

  const visibleRows = useMemo(() => {
    if (!rows) return null;
    const q = search.trim().toLowerCase();
    if (q === '') return rows;
    return rows.filter((r) => r.category_name.toLowerCase().includes(q));
  }, [rows, search]);

  const parentOptions = useMemo(() => {
    if (!rows) return [];
    const excludeId = editTarget?.id;
    return rows
      .filter((r) => r.id !== excludeId)
      .map((r) => r.category_name)
      .sort();
  }, [rows, editTarget]);

  const openCreate = useCallback(() => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setErrs({});
    setFormError(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((row: ItemCategoryItem) => {
    setEditTarget(row);
    setForm({
      category_name: row.category_name,
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
    const nameErr = validateRequired(s.category_name, 'Category name');
    if (nameErr) e.category_name = nameErr;
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
        (r) => r.category_name.toLowerCase() === trimmedParent.toLowerCase()
      );
      if (!match) {
        setFormError(`Parent "${trimmedParent}" doesn't exist. Pick from the dropdown or leave blank for Primary.`);
        return;
      }
      if (editTarget && match.id === editTarget.id) {
        setFormError('A category cannot be its own parent.');
        return;
      }
      parent_id = match.id;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editTarget) {
        await itemCategoryService.update(editTarget.id, { category_name: form.category_name.trim(), parent_id });
      } else {
        await itemCategoryService.create({ category_name: form.category_name.trim(), parent_id });
      }
      await load();
      closeModal();
    } catch (err: any) {
      const code = err?.response?.data?.error;
      const codeMap: Record<string, string> = {
        name_taken: 'An item category with that name already exists.',
        invalid_name: 'Category name is required.',
        parent_not_found: 'The selected parent category no longer exists.',
        cannot_be_self_parent: 'A category cannot be its own parent.',
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
      await itemCategoryService.remove(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Could not delete the category.';
      Alert.alert('Cannot delete', msg);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, load]);

  const columns: Column<ItemCategoryItem>[] = [
    {
      key: 'category_name', label: 'Category Name',
      render: (r) => <Text style={styles.nameCell}>{r.category_name}</Text>,
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
          {canDoAction(user, 'itemcategory', 'edit') && (
            <Pressable
              onPress={() => openEdit(r)}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${r.category_name}`}
              testID={`edit-item-category-${r.id}`}
            >
              <Text style={styles.editAction}>Edit</Text>
            </Pressable>
          )}
          {canDoAction(user, 'itemcategory', 'delete') && (
            <Pressable
              onPress={() => setDeleteTarget(r)}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${r.category_name}`}
              testID={`delete-item-category-${r.id}`}
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
        <Text style={styles.title}>Item Categories</Text>
        <View style={styles.headerActions}>
          {canDoAction(user, 'itemcategory', 'create') && (
            <View style={styles.newBtn}>
              <ButtonPrimary
                title="Create Category"
                onPress={openCreate}
                testID="new-item-category-btn"
              />
            </View>
          )}
        </View>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search item categories..."
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          testID="item-categories-search-input"
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
          <DataTable<ItemCategoryItem>
            columns={columns}
            rows={visibleRows ?? []}
            keyExtractor={(r) => r.id}
            emptyLabel={
              search
                ? `No categories match "${search}".`
                : 'No item categories yet — click Create Category to add one.'
            }
            testID="item-categories-table"
          />
        </View>
      )}

      <Modal
        visible={modalOpen}
        onClose={closeModal}
        title={editTarget ? 'Edit Item Category' : 'Create Item Category'}
        testID="item-category-modal"
      >
        <View style={[styles.formScroll, styles.formContent, { zIndex: 10 }]}>
          {formError ? (
            <View style={styles.formError}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}

          <AutocompleteField
            label="Category Name *"
            value={form.category_name}
            options={[]}
            onChangeText={(v) => setForm((f) => ({ ...f, category_name: v }))}
            error={errs.category_name ?? null}
            placeholder="e.g. Software"
            testID="item-category-name-input"
          />

          <AutocompleteField
            label="Parent Category"
            value={form.parent_name}
            options={parentOptions}
            onChangeText={(v) => setForm((f) => ({ ...f, parent_name: v }))}
            placeholder="Type to search... (leave blank for Primary)"
            testID="item-category-parent-input"
          />

          <View style={styles.actions}>
            <Pressable onPress={closeModal} style={styles.cancelBtn} testID="item-category-cancel-btn">
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <View style={styles.submitWrap}>
              <ButtonPrimary
                title={editTarget ? 'Save changes' : 'Create'}
                onPress={onSubmit}
                loading={saving}
                testID="item-category-submit-btn"
              />
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={!!deleteTarget}
        title="Delete item category"
        message={
          deleteTarget
            ? `Delete "${deleteTarget.category_name}"? This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        danger
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={onDelete}
        testID="delete-item-category-confirm"
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
