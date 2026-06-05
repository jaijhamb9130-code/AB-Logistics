/**
 * VoucherTypeScreen — Tally-style voucher-type master (under Masters).
 *
 * Table: S.No · Name (lock for system) · Parent · Actions.
 *   - The 8 system types (is_system) are locked → shown as "system", no edit/delete.
 *   - Primaries (parent_id === id) show their own name in the Parent column.
 *   - Custom children show their parent's name.
 *
 * Create/Edit modal: Name + Parent (searchable, lists PRIMARIES only). Leaving
 * Parent blank creates a new primary; picking one creates a child that inherits
 * the parent's posting behaviour (handled server-side).
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
import { vchTypeService } from '../services/vchTypeService';
import { branchService } from '../services/branchService';
import { validateRequired } from '../utils/masterValidators';
import type { VchType } from '../../../shared/types/voucher';
import { useAuth } from '../context/AuthContext';
import { canDoAction } from '../navigation/guards';

const EMPTY_FORM = { name: '', parent_name: '', prefix: '', branch: '' };
type FormState = typeof EMPTY_FORM;
type FormErrors = Partial<Record<keyof FormState, string>>;

// A primary type self-references its own id (matches the system-type convention).
const isPrimary = (t: VchType) => t.parent_id === t.id || t.parent_id === null;

export function VoucherTypeScreen() {
  const { user } = useAuth();
  const [rows, setRows] = useState<VchType[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Branch options for the modal's Branch picker (from branch_master).
  const [branchOptions, setBranchOptions] = useState<string[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<VchType | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errs, setErrs] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<VchType | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Prefix editing — parents use this modal (they're locked, so no inline
  // field); children edit their prefix inline in the table/card row.
  const [prefixTarget, setPrefixTarget] = useState<VchType | null>(null);
  const [prefixValue, setPrefixValue] = useState('');
  const [savingPrefix, setSavingPrefix] = useState(false);
  const [prefixError, setPrefixError] = useState<string | null>(null);
  const canEditPrefix = canDoAction(user, 'voucher', 'edit');

  const load = useCallback(async () => {
    setListError(null);
    try {
      const all = await vchTypeService.list();
      // "Freight Journal" is an internal companion type auto-posted by every
      // bilty — it must never be user-managed, so keep it out of this master
      // list entirely (also excludes it from the Parent dropdown below).
      setRows(all.filter((t) => t.name !== 'Freight Journal'));
    } catch {
      setListError('Could not load voucher types.');
      setRows([]);
    }
  }, []);

  useAutoRefresh(load);

  // Load branch names once for the modal's Branch picker.
  React.useEffect(() => {
    branchService.list()
      .then((rs) => setBranchOptions(rs.map((r) => r.name).sort()))
      .catch(() => { /* picker just has no options */ });
  }, []);

  const visibleRows = useMemo(() => {
    if (!rows) return null;
    const q = search.trim().toLowerCase();
    const filtered = q === '' ? rows : rows.filter((r) => r.name.toLowerCase().includes(q));
    // Display order (same on web + mobile): all PARENT (primary) types first,
    // in sequence, then the CHILD types after. Alphabetical within each group.
    return [...filtered].sort((a, b) => {
      const aPrimary = isPrimary(a) ? 0 : 1;
      const bPrimary = isPrimary(b) ? 0 : 1;
      if (aPrimary !== bPrimary) return aPrimary - bPrimary;
      return a.name.localeCompare(b.name);
    });
  }, [rows, search]);

  // Parent dropdown lists PRIMARIES only (children always sit under a primary),
  // excluding the row being edited so it can't pick itself.
  const parentOptions = useMemo(() => {
    if (!rows) return [];
    const excludeId = editTarget?.id;
    return rows
      .filter((r) => isPrimary(r) && r.id !== excludeId)
      .map((r) => r.name)
      .sort();
  }, [rows, editTarget]);

  const openCreate = useCallback(() => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setErrs({});
    setFormError(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((row: VchType) => {
    setEditTarget(row);
    // A primary's "parent" is itself (parent_name is null from the API), so
    // show it blank in the edit form — blank means "primary".
    setForm({ name: row.name, parent_name: row.parent_name ?? '', prefix: row.prefix ?? '', branch: row.branch ?? '' });
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
    const nameErr = validateRequired(s.name, 'Name');
    if (nameErr) e.name = nameErr;
    return e;
  };

  const onSubmit = useCallback(async () => {
    const e = validate(form);
    setErrs(e);
    if (Object.keys(e).length > 0) return;

    // Resolve parent name → id (blank = primary).
    let parent_id: number | null = null;
    const trimmedParent = form.parent_name.trim();
    if (trimmedParent !== '') {
      const match = rows?.find((r) => r.name.toLowerCase() === trimmedParent.toLowerCase());
      if (!match) {
        setFormError(`Parent "${trimmedParent}" doesn't exist. Pick from the dropdown or leave blank for a primary type.`);
        return;
      }
      if (editTarget && match.id === editTarget.id) {
        setFormError('A voucher type cannot be its own parent.');
        return;
      }
      parent_id = match.id;
    }

    setSaving(true);
    setFormError(null);
    try {
      const prefix = form.prefix.trim();
      const branch = form.branch.trim();
      if (editTarget) {
        await vchTypeService.update(editTarget.id, { name: form.name.trim(), parent_id, prefix, branch });
      } else {
        await vchTypeService.create({ name: form.name.trim(), parent_id, prefix, branch });
      }
      await load();
      closeModal();
    } catch (err: any) {
      const code = err?.response?.data?.error;
      const serverMessage = err?.response?.data?.message;
      const codeMap: Record<string, string> = {
        invalid_name: 'Name is required.',
        parent_not_found: 'The selected parent type no longer exists.',
        system_type_immutable: 'System voucher types cannot be changed.',
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
      await vchTypeService.remove(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      const code = err?.response?.data?.error;
      const codeMap: Record<string, string> = {
        has_children: 'Remove or re-parent its child types first.',
        in_use: 'This type is used by existing vouchers and cannot be deleted.',
        system_type_immutable: 'System voucher types cannot be deleted.',
      };
      const msg = err?.response?.data?.message || codeMap[code] || 'Could not delete the voucher type.';
      Alert.alert('Cannot delete', msg);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, load]);

  const openPrefixModal = useCallback((row: VchType) => {
    setPrefixTarget(row);
    setPrefixValue(row.prefix ?? '');
    setPrefixError(null);
  }, []);

  const savePrefixModal = useCallback(async () => {
    if (!prefixTarget) return;
    setSavingPrefix(true);
    setPrefixError(null);
    try {
      await vchTypeService.setPrefix(prefixTarget.id, prefixValue.trim());
      await load();
      setPrefixTarget(null);
    } catch (err: any) {
      setPrefixError(err?.response?.data?.message || 'Could not save prefix. Use up to 16 letters, digits or - / _ . characters.');
    } finally {
      setSavingPrefix(false);
    }
  }, [prefixTarget, prefixValue, load]);

  const columns: Column<VchType>[] = [
    {
      key: 'name', label: 'Name',
      render: (r) => (
        <View style={styles.nameWrap}>
          <Text style={styles.nameCell}>{r.name}</Text>
          {r.is_system ? <Text style={styles.lock}>🔒</Text> : null}
        </View>
      ),
    },
    {
      key: 'prefix', label: 'Prefix', width: 140,
      // Display-only — the prefix is edited via the Actions "Edit" button
      // (prefix-only modal for system primaries, full modal for the rest).
      render: (r) => {
        const has = !!(r.prefix && r.prefix.trim());
        return (
          <Text style={[styles.prefixValue, !has && styles.prefixValueEmpty]} numberOfLines={1}>
            {has ? r.prefix : '—'}
          </Text>
        );
      },
    },
    {
      key: 'parent', label: 'Parent', width: 220,
      // Primaries show their own name (they're their own parent); children show
      // the parent's name — matches the master table mockup.
      render: (r) => <Text style={styles.parentCell}>{r.parent_name ?? r.name}</Text>,
    },
    {
      key: 'branch', label: 'Branch', width: 180,
      // Optional branch tied to the type — auto-fills + locks the bilty Branch.
      render: (r) => {
        const has = !!(r.branch && r.branch.trim());
        return (
          <Text style={[styles.parentCell, !has && styles.prefixValueEmpty]} numberOfLines={1}>
            {has ? r.branch : '—'}
          </Text>
        );
      },
    },
    {
      key: 'actions', label: 'Actions', width: 130, align: 'right',
      render: (r) => {
        // System primaries are locked except for their prefix → a single Edit
        // button opens the prefix-only modal.
        if (r.is_system) {
          if (!canEditPrefix) return <Text style={styles.systemTag}>system</Text>;
          return (
            <View style={styles.rowActions}>
              <Pressable onPress={() => openPrefixModal(r)} accessibilityRole="button" accessibilityLabel={`Set prefix for ${r.name}`} testID={`prefix-vchtype-${r.id}`}>
                <Text style={styles.editAction}>Edit</Text>
              </Pressable>
            </View>
          );
        }
        // Custom types (children + user-made primaries) → full edit (name +
        // prefix + parent) and delete.
        return (
          <View style={styles.rowActions}>
            {canDoAction(user, 'voucher', 'edit') && (
              <Pressable onPress={() => openEdit(r)} accessibilityRole="button" accessibilityLabel={`Edit ${r.name}`} testID={`edit-vchtype-${r.id}`}>
                <Text style={styles.editAction}>Edit</Text>
              </Pressable>
            )}
            {canDoAction(user, 'voucher', 'delete') && (
              <Pressable onPress={() => setDeleteTarget(r)} accessibilityRole="button" accessibilityLabel={`Delete ${r.name}`} testID={`delete-vchtype-${r.id}`}>
                <Text style={styles.deleteAction}>Delete</Text>
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
        <Text style={styles.title}>Voucher Types</Text>
        <View style={styles.headerActions}>
          {canDoAction(user, 'voucher', 'create') && (
            <View style={styles.newBtn}>
              <ButtonPrimary title="+ Add Type" onPress={openCreate} testID="new-vchtype-btn" />
            </View>
          )}
        </View>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search types..."
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          testID="vchtype-search-input"
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
          <DataTable<VchType>
            columns={columns}
            rows={visibleRows ?? []}
            keyExtractor={(r) => r.id}
            emptyLabel={search ? `No types match "${search}".` : 'No voucher types yet — click Add Type to create one.'}
            testID="vchtype-table"
          />
        </View>
      )}

      <Modal
        visible={modalOpen}
        onClose={closeModal}
        title={editTarget ? 'Edit Voucher Type' : 'Create Voucher Type'}
        testID="vchtype-modal"
      >
        <View style={[styles.formScroll, styles.formContent, { zIndex: 10 }]}>
          {formError ? (
            <View style={styles.formError}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}

          {/* Row 1 — Name + Prefix side by side */}
          <View style={styles.formRow}>
            <View style={styles.formColName}>
              <AutocompleteField
                label="Name *"
                value={form.name}
                options={[]}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                error={errs.name ?? null}
                placeholder="e.g. Sales Return"
                testID="vchtype-name-input"
              />
            </View>
            <View style={styles.formColPrefix}>
              <AutocompleteField
                label="Prefix"
                value={form.prefix}
                options={[]}
                onChangeText={(v) => setForm((f) => ({ ...f, prefix: v }))}
                placeholder="e.g. SAL"
                testID="vchtype-prefix-field"
              />
            </View>
          </View>

          {/* Row 2 — Parent + Branch side by side */}
          <View style={styles.formRow}>
            <View style={styles.formColHalf}>
              <AutocompleteField
                label="Parent"
                value={form.parent_name}
                options={parentOptions}
                onChangeText={(v) => setForm((f) => ({ ...f, parent_name: v }))}
                placeholder="Search & select parent... (blank = primary)"
                testID="vchtype-parent-input"
                usePortal
              />
            </View>
            <View style={styles.formColHalf}>
              <AutocompleteField
                label="Branch"
                value={form.branch}
                options={branchOptions}
                onChangeText={(v) => setForm((f) => ({ ...f, branch: v }))}
                placeholder="Search & select branch... (blank = none)"
                testID="vchtype-branch-input"
                usePortal
              />
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable onPress={closeModal} style={styles.cancelBtn} testID="vchtype-cancel-btn">
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <View style={styles.submitWrap}>
              <ButtonPrimary
                title={editTarget ? 'Save changes' : 'Create'}
                onPress={onSubmit}
                loading={saving}
                testID="vchtype-submit-btn"
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!prefixTarget}
        onClose={() => setPrefixTarget(null)}
        title={prefixTarget ? `Prefix — ${prefixTarget.name}` : 'Prefix'}
        testID="vchtype-prefix-modal"
      >
        <View style={styles.formContent}>
          {prefixError ? (
            <View style={styles.formError}>
              <Text style={styles.formErrorText}>{prefixError}</Text>
            </View>
          ) : null}
          <Text style={styles.prefixHint}>
            Auto-fills the voucher number as <Text style={styles.prefixHintBold}>PREFIX-001</Text>.
            Leave blank for plain numbering (001, 002…).
          </Text>
          <Text style={styles.fieldLabel}>Prefix</Text>
          <TextInput
            value={prefixValue}
            onChangeText={setPrefixValue}
            placeholder="e.g. SAL"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="characters"
            maxLength={16}
            style={styles.searchInput}
            testID="vchtype-prefix-input"
          />
          <View style={styles.actions}>
            <Pressable onPress={() => setPrefixTarget(null)} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <View style={styles.submitWrap}>
              <ButtonPrimary title="Save prefix" onPress={savePrefixModal} loading={savingPrefix} testID="vchtype-prefix-save" />
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={!!deleteTarget}
        title="Delete voucher type"
        message={deleteTarget ? `Delete "${deleteTarget.name}"? This cannot be undone.` : ''}
        confirmLabel="Delete"
        danger
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={onDelete}
        testID="delete-vchtype-confirm"
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
  newBtn: { minWidth: 150 },
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
  nameWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  nameCell: { color: colors.text, fontFamily: typography.uiBold, fontSize: 14 },
  lock: { fontSize: 12, color: colors.textMuted },
  parentCell: { color: colors.text, fontFamily: typography.ui, fontSize: 14 },

  // Prefix column — display only (edited via Actions → modal).
  prefixValue: { color: colors.text, fontFamily: typography.mono, fontSize: 14 },
  prefixValueEmpty: { color: colors.textMuted, fontFamily: typography.ui },
  // Create/Edit modal — Name + Prefix share row 1.
  formRow: { flexDirection: 'row', gap: spacing.md },
  formColName: { flex: 2, minWidth: 0 },
  formColPrefix: { flex: 1, minWidth: 0 },
  formColHalf: { flex: 1, minWidth: 0 },
  prefixHint: { ...text.label, color: colors.textMuted, marginBottom: spacing.sm },
  prefixHintBold: { color: colors.text, fontFamily: typography.mono, fontWeight: '600' },
  fieldLabel: { ...text.label, color: colors.textLabel, marginBottom: spacing.xs },
  systemTag: { color: colors.textMuted, fontFamily: typography.ui, fontSize: 13, fontStyle: 'italic' },
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
