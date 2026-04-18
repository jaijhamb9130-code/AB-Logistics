/**
 * UsersScreen — admin-only user list + New User create flow (plan 02-02 / Task 2).
 *
 * Layout (Tally-enterprise, NOT glassmorphism per D-04):
 *   ┌ header row: "Users" title + "New User" button
 *   ├ list-level error banner (if load fails)
 *   └ DataTable (6 columns: ID, Username, Role, Permissions, Status, Created)
 *
 * Create flow: "New User" opens <Modal> with InputField + PasswordField +
 * role radios + PermissionPicker. Submit delegates to `handleCreateUserSubmit`
 * (see ./usersController.ts) — which validates, calls userService.create,
 * refreshes the list, and maps server error codes to user-facing copy.
 *
 * Gating: non-admin users never reach this screen — AppTabs uses
 * canAccessTab('Users', user) (Phase 1 T-01-19). No redundant check here.
 *
 * All styling via theme tokens — zero hardcoded hex.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  ScrollView,
} from 'react-native';
import { ButtonPrimary } from '../components/ButtonPrimary';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DataTable, type Column } from '../components/DataTable';
import { InputField } from '../components/InputField';
import { Loader } from '../components/Loader';
import { Modal } from '../components/Modal';
import { PasswordField } from '../components/PasswordField';
import { PermissionPicker } from '../components/PermissionPicker';
import { useAuth } from '../context/AuthContext';
import {
  PERMISSION_LABELS,
  ROLE_OPTIONS,
} from '../constants/roles';
import { colors, radius, spacing, text, typography } from '../constants/theme';
import { userService } from '../services/userService';
import {
  type CreateUserErrors,
  type UpdateUserErrors,
} from '../utils/userValidation';
import type {
  Permission,
  Role,
  UserListItem,
} from '../../../shared/types/user';
import {
  handleActivateConfirm,
  handleCreateUserSubmit,
  handleDeactivateConfirm,
  handleEditUserSubmit,
  isSelf,
  type CreateUserForm,
  type EditUserForm,
} from './usersController';

const EMPTY_FORM: CreateUserForm = {
  username: '',
  password: '',
  role: '',
  permissions: [],
};

const FIELD_ERROR_COPY: Record<string, string> = {
  required: 'Required',
  too_short: 'Too short',
  too_long: 'Too long',
  invalid_format: 'Invalid format',
  invalid_value: 'Choose a value',
};

export function UsersScreen() {
  const { user: currentUser } = useAuth();

  // ---- List state (null = first-load in flight) ----
  const [rows, setRows] = useState<UserListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  // ---- Create modal + form state ----
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CreateUserForm>(EMPTY_FORM);
  const [errs, setErrs] = useState<CreateUserErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ---- Edit modal state (plan 02-03) ----
  const [editTarget, setEditTarget] = useState<UserListItem | null>(null);
  const [editForm, setEditForm] = useState<EditUserForm>({
    password: '',
    role: 'staff',
    permissions: [],
  });
  const [editErrs, setEditErrs] = useState<UpdateUserErrors>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // ---- Deactivate confirm state (plan 02-03) ----
  const [deactivateTarget, setDeactivateTarget] = useState<UserListItem | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  // ---- Activate confirm state (plan 02-04 addendum) ----
  const [activateTarget, setActivateTarget] = useState<UserListItem | null>(null);
  const [activating, setActivating] = useState(false);

  // ---- Load / refresh ----
  const load = useCallback(async () => {
    setListError(null);
    try {
      const list = await userService.list();
      setRows(list);
    } catch (_e) {
      setListError('Could not load users. Try again.');
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ---- Modal open/close ----
  const openModal = useCallback(() => {
    setForm(EMPTY_FORM);
    setErrs({});
    setFormError(null);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setForm(EMPTY_FORM);
    setErrs({});
    setFormError(null);
  }, []);

  // ---- Submit ----
  const onSubmit = useCallback(() => {
    handleCreateUserSubmit(form, {
      onValidationError: setErrs,
      onFormError: setFormError,
      onSubmittingChange: setSubmitting,
      onSuccess: () => {
        closeModal();
      },
      reloadList: load,
    });
  }, [form, load, closeModal]);

  // ---- Edit modal open/close (plan 02-03) ----
  const openEdit = useCallback((r: UserListItem) => {
    setEditTarget(r);
    setEditForm({
      password: '',
      role: r.role,
      permissions: [...r.permissions],
    });
    setEditErrs({});
    setEditError(null);
  }, []);

  const closeEdit = useCallback(() => {
    setEditTarget(null);
    setEditErrs({});
    setEditError(null);
  }, []);

  const replaceRow = useCallback((updated: UserListItem) => {
    setRows((prev) => (prev ? prev.map((u) => (u.id === updated.id ? updated : u)) : prev));
  }, []);

  const onEditSave = useCallback(() => {
    if (!editTarget) return;
    handleEditUserSubmit(editTarget, editForm, {
      onValidationError: setEditErrs,
      onFormError: setEditError,
      onSubmittingChange: setEditSaving,
      onSuccess: () => {
        closeEdit();
      },
      replaceRow,
    });
  }, [editTarget, editForm, closeEdit, replaceRow]);

  // ---- Deactivate flow (plan 02-03) ----
  const openDeactivate = useCallback((r: UserListItem) => {
    // Client-side self-lockout guard (T-02-14). The Deactivate pressable is
    // also rendered disabled, so this is defence-in-depth.
    if (isSelf(currentUser, r)) return;
    setDeactivateTarget(r);
  }, [currentUser]);

  const onDeactivateConfirm = useCallback(() => {
    if (!deactivateTarget) return;
    handleDeactivateConfirm(deactivateTarget, {
      onLoadingChange: setDeactivating,
      onError: (copy) => {
        Alert.alert('Action blocked', copy);
        setDeactivateTarget(null);
      },
      onSuccess: () => {
        setDeactivateTarget(null);
      },
      replaceRow,
      reloadList: load,
    });
  }, [deactivateTarget, replaceRow, load]);

  // ---- Activate flow (plan 02-04 addendum) ----
  // No self-lockout guard: inactive users cannot sign in, so req.user can
  // never be the target of activate (backend + client agree — see
  // handleActivateConfirm comment).
  const openActivate = useCallback((r: UserListItem) => {
    setActivateTarget(r);
  }, []);

  const onActivateConfirm = useCallback(() => {
    if (!activateTarget) return;
    handleActivateConfirm(activateTarget, {
      onLoadingChange: setActivating,
      onError: (copy) => {
        Alert.alert('User not found', copy);
        setActivateTarget(null);
      },
      onSuccess: () => {
        setActivateTarget(null);
      },
      replaceRow,
      reloadList: load,
    });
  }, [activateTarget, replaceRow, load]);

  // ---- Columns (exact keys + order per plan) ----
  const columns: Column<UserListItem>[] = [
    { key: 'id', label: 'ID', width: 60, align: 'right', render: (r) => r.id },
    { key: 'username', label: 'Username', width: 180, render: (r) => r.username },
    { key: 'role', label: 'Role', width: 80, render: (r) => r.role },
    {
      key: 'permissions',
      label: 'Permissions',
      render: (r) =>
        r.permissions.length > 0
          ? r.permissions.map((p) => PERMISSION_LABELS[p]).join(', ')
          : '—',
    },
    {
      key: 'is_active',
      label: 'Status',
      width: 90,
      render: (r) => (
        <View style={[styles.badge, r.is_active ? styles.badgeActive : styles.badgeInactive]}>
          <Text
            style={[
              styles.badgeText,
              { color: r.is_active ? colors.success : colors.danger },
            ]}
          >
            {r.is_active ? 'Active' : 'Inactive'}
          </Text>
        </View>
      ),
    },
    { key: 'created_at', label: 'Created', width: 200, render: (r) => formatDate(r.created_at) },
    {
      key: 'actions',
      label: '',
      width: 180,
      align: 'right',
      render: (r) => {
        const self = isSelf(currentUser, r);
        return (
          <View style={styles.rowActions}>
            <Pressable
              onPress={() => openEdit(r)}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${r.username}`}
              testID={`edit-${r.id}`}
            >
              <Text style={styles.editAction}>Edit</Text>
            </Pressable>
            {r.is_active ? (
              <Pressable
                onPress={() => openDeactivate(r)}
                disabled={self}
                accessibilityRole="button"
                accessibilityLabel={
                  self
                    ? 'You cannot deactivate your own account'
                    : `Deactivate ${r.username}`
                }
                accessibilityState={{ disabled: self }}
                testID={`deactivate-${r.id}`}
              >
                <Text
                  style={[
                    styles.deactivateAction,
                    self && styles.actionDisabled,
                  ]}
                >
                  Deactivate
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => openActivate(r)}
                accessibilityRole="button"
                accessibilityLabel={`Activate ${r.username}`}
                testID={`activate-${r.id}`}
              >
                <Text style={styles.activateAction}>Activate</Text>
              </Pressable>
            )}
          </View>
        );
      },
    },
  ];

  // ---- Render ----
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Users</Text>
        <View style={styles.headerBtn}>
          <ButtonPrimary title="New User" onPress={openModal} testID="new-user-btn" />
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
          <DataTable<UserListItem>
            columns={columns}
            rows={rows}
            keyExtractor={(r) => r.id}
            emptyLabel="No users yet — click New User to add one."
            testID="users-table"
          />
        </View>
      )}

      {/* ----- Edit User Modal (plan 02-03) ----- */}
      <Modal
        visible={!!editTarget}
        onClose={closeEdit}
        title={editTarget ? `Edit ${editTarget.username}` : ''}
        testID="edit-user-modal"
      >
        {editTarget ? (
          <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContent}>
            {editError ? (
              <View style={styles.formError}>
                <Text style={styles.formErrorText}>{editError}</Text>
              </View>
            ) : null}

            <Text style={styles.readonlyLabel}>Username</Text>
            <Text style={styles.readonlyValue}>{editTarget.username}</Text>

            <Text style={styles.fieldLabel}>Role</Text>
            <View style={styles.roleRow}>
              {ROLE_OPTIONS.map((opt) => {
                const selected = editForm.role === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setEditForm((f) => ({ ...f, role: opt.value as Role }))}
                    style={[styles.roleOption, selected && styles.roleOptionSelected]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    testID={`edit-role-${opt.value}`}
                  >
                    <View style={[styles.radio, selected && styles.radioSelected]} />
                    <Text style={[styles.roleLabel, selected && styles.roleLabelSelected]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {editErrs.role ? (
              <Text style={styles.fieldError}>{FIELD_ERROR_COPY[editErrs.role]}</Text>
            ) : null}

            <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Permissions</Text>
            <PermissionPicker
              value={editForm.permissions}
              onChange={(perms: Permission[]) =>
                setEditForm((f) => ({ ...f, permissions: perms }))
              }
              testID="edit-permission-picker"
            />
            {editErrs.permissions ? (
              <Text style={styles.fieldError}>Select at least one permission.</Text>
            ) : null}

            <PasswordField
              label="Reset password (optional)"
              value={editForm.password}
              onChangeText={(v) => setEditForm((f) => ({ ...f, password: v }))}
              error={editErrs.password ? 'Password must be at least 8 characters.' : null}
              testID="edit-password-input"
            />

            <View style={styles.actions}>
              <Pressable
                onPress={closeEdit}
                style={styles.cancelBtn}
                accessibilityRole="button"
                testID="edit-cancel-btn"
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <View style={styles.submitWrap}>
                <ButtonPrimary
                  title="Save changes"
                  onPress={onEditSave}
                  loading={editSaving}
                  testID="edit-submit-btn"
                />
              </View>
            </View>
          </ScrollView>
        ) : null}
      </Modal>

      {/* ----- Deactivate Confirm Dialog (plan 02-03) ----- */}
      <ConfirmDialog
        visible={!!deactivateTarget}
        title="Deactivate user"
        message={
          deactivateTarget
            ? `Deactivate ${deactivateTarget.username}? They will lose access immediately.`
            : ''
        }
        confirmLabel="Deactivate"
        danger
        loading={deactivating}
        onCancel={() => setDeactivateTarget(null)}
        onConfirm={onDeactivateConfirm}
        testID="deactivate-confirm"
      />

      {/* ----- Activate Confirm Dialog (plan 02-04 addendum) ----- */}
      <ConfirmDialog
        visible={!!activateTarget}
        title="Activate user"
        message={
          activateTarget
            ? `Activate ${activateTarget.username}? They will regain access with their prior permissions.`
            : ''
        }
        confirmLabel="Activate"
        variant="default"
        loading={activating}
        onCancel={() => setActivateTarget(null)}
        onConfirm={onActivateConfirm}
        testID="activate-confirm"
      />

      {/* ----- New User Modal ----- */}
      <Modal visible={modalOpen} onClose={closeModal} title="New User">
        <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContent}>
          {formError ? (
            <View style={styles.formError}>
              <Text style={styles.formErrorText}>{formError}</Text>
            </View>
          ) : null}

          <InputField
            label="Username"
            value={form.username}
            onChangeText={(v) => setForm((f) => ({ ...f, username: v }))}
            error={errs.username ? FIELD_ERROR_COPY[errs.username] : null}
            autoCapitalize="none"
            autoCorrect={false}
            testID="username-input"
          />

          <PasswordField
            label="Password"
            value={form.password}
            onChangeText={(v) => setForm((f) => ({ ...f, password: v }))}
            error={errs.password ? FIELD_ERROR_COPY[errs.password] : null}
            testID="password-input"
          />

          <Text style={styles.fieldLabel}>Role</Text>
          <View style={styles.roleRow}>
            {ROLE_OPTIONS.map((opt) => {
              const selected = form.role === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setForm((f) => ({ ...f, role: opt.value as Role }))}
                  style={[styles.roleOption, selected && styles.roleOptionSelected]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  testID={`role-${opt.value}`}
                >
                  <View style={[styles.radio, selected && styles.radioSelected]} />
                  <Text style={[styles.roleLabel, selected && styles.roleLabelSelected]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {errs.role ? (
            <Text style={styles.fieldError}>{FIELD_ERROR_COPY[errs.role]}</Text>
          ) : null}

          <Text style={[styles.fieldLabel, { marginTop: spacing.md }]}>Permissions</Text>
          <PermissionPicker
            value={form.permissions}
            onChange={(perms: Permission[]) => setForm((f) => ({ ...f, permissions: perms }))}
            testID="permission-picker"
          />
          {errs.permissions ? (
            <Text style={styles.fieldError}>{FIELD_ERROR_COPY[errs.permissions]}</Text>
          ) : null}

          <View style={styles.actions}>
            <Pressable
              onPress={closeModal}
              style={styles.cancelBtn}
              accessibilityRole="button"
              testID="cancel-btn"
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <View style={styles.submitWrap}>
              <ButtonPrimary
                title="Create user"
                onPress={onSubmit}
                loading={submitting}
                testID="submit-btn"
              />
            </View>
          </View>
        </ScrollView>
      </Modal>
    </View>
  );
}

// ISO → readable local short form. Kept simple (no date-fns dependency).
function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toISOString().slice(0, 19).replace('T', ' ');
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: {
    ...text.heading,
    fontSize: 22,
    lineHeight: 28,
  },
  headerBtn: {
    minWidth: 140,
  },
  tableWrap: {
    flex: 1,
    minHeight: 200,
  },
  errorBanner: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorBannerText: {
    ...text.label,
    color: colors.danger,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  badgeActive: {
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  badgeInactive: {
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  badgeText: {
    ...text.pill,
  },
  formScroll: {
    maxHeight: 500,
  },
  formContent: {
    paddingBottom: spacing.sm,
  },
  formError: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  formErrorText: {
    ...text.label,
    color: colors.danger,
  },
  fieldLabel: {
    ...text.label,
    marginBottom: spacing.xs,
  },
  roleRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    marginRight: spacing.sm,
  },
  roleOptionSelected: {
    borderColor: colors.brandRed,
  },
  radio: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  radioSelected: {
    borderColor: colors.brandRed,
    backgroundColor: colors.brandRed,
  },
  roleLabel: {
    ...text.value,
    color: colors.text,
  },
  roleLabelSelected: {
    ...text.valueStrong,
    color: colors.brandRed,
  },
  fieldError: {
    ...text.meta,
    color: colors.danger,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  cancelBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginRight: spacing.sm,
  },
  cancelBtnText: {
    ...text.action,
    color: colors.textMuted,
    fontSize: 14,
  },
  submitWrap: {
    minWidth: 160,
  },
  rowActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
  },
  editAction: {
    ...text.action,
    color: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  deactivateAction: {
    ...text.action,
    color: colors.danger,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 88,
    textAlign: 'right',
  },
  activateAction: {
    ...text.action,
    color: colors.success,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 88,
    textAlign: 'right',
  },
  actionDisabled: {
    color: colors.textMuted,
    opacity: 0.5,
  },
  readonlyLabel: {
    ...text.label,
    marginTop: spacing.sm,
  },
  readonlyValue: {
    ...text.valueStrong,
    fontSize: 16,
    marginBottom: spacing.md,
  },
});
