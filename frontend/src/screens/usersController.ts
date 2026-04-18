/**
 * usersController — pure orchestration for the New-User create flow
 * used by UsersScreen (plan 02-02 / Task 2).
 *
 * Kept in a separate module (not inside UsersScreen.tsx) so the ts-jest +
 * node testEnv can exercise the submit orchestration without pulling in
 * React Native. UsersScreen.tsx imports and wires these into its state
 * setters.
 *
 * Mapping table (server error → user-facing copy) is centralized here so
 * plan 02-03's edit flow can reuse it. See 02-02-SUMMARY.md for the table.
 */

import type {
  CreateUserRequest,
  Permission,
  Role,
  UpdateUserRequest,
  User,
  UserListItem,
} from '../../../shared/types/user';
import { userService } from '../services/userService';
import {
  validateCreateUser,
  validateUpdateUser,
  type CreateUserErrors,
  type UpdateUserErrors,
} from '../utils/userValidation';

export interface CreateUserForm {
  username: string;
  password: string;
  role: Role | '';
  permissions: Permission[];
}

export interface SubmitCallbacks {
  /** Called with the error object whenever validation fails (may be empty). */
  onValidationError: (errs: CreateUserErrors) => void;
  /** Set/clear form-level error banner copy. Called with null before submit. */
  onFormError: (copy: string | null) => void;
  /** Toggle submit spinner. Called with true before request, false in finally. */
  onSubmittingChange: (submitting: boolean) => void;
  /** Fires AFTER a successful create. Screen uses this to close modal + reset form. */
  onSuccess: (row: UserListItem) => void;
  /** Triggers a re-fetch of the users list on success. */
  reloadList: () => Promise<void>;
}

/**
 * Submit orchestrator. Validates client-side first; only hits the server
 * when validation passes. Server errors are mapped to user copy via
 * mapCreateUserError; the caller decides whether to close the modal based
 * on which callbacks fired (onSuccess vs onFormError).
 */
export async function handleCreateUserSubmit(
  form: CreateUserForm,
  cb: SubmitCallbacks
): Promise<void> {
  // Trim whitespace BEFORE validation so that leading/trailing spaces in the
  // input field don't produce `invalid_format` errors — matches the backend's
  // behaviour (server-side validator runs on the JSON body, which this
  // orchestrator sends with a trimmed username).
  const normalized: CreateUserForm = {
    ...form,
    username: form.username.trim(),
  };

  const errs = validateCreateUser(normalized);
  cb.onValidationError(errs);
  if (Object.keys(errs).length > 0) return;

  cb.onFormError(null);
  cb.onSubmittingChange(true);

  try {
    const body: CreateUserRequest = {
      username: normalized.username,
      password: normalized.password,
      role: normalized.role as Role,
      permissions: [...normalized.permissions],
    };
    const created = await userService.create(body);
    await cb.reloadList();
    cb.onSuccess(created);
  } catch (e: unknown) {
    const err = e as { response?: { status?: number; data?: { error?: string } } };
    const status = err?.response?.status;
    const code = err?.response?.data?.error;
    cb.onFormError(mapCreateUserError(status, code));
  } finally {
    cb.onSubmittingChange(false);
  }
}

/**
 * Canonical error-code → user-facing copy mapping. Shared by UsersScreen
 * (create) and plan 02-03 (edit). Unknown codes fall back to a generic copy.
 */
export function mapCreateUserError(
  status: number | undefined,
  code: string | undefined
): string {
  if (status === 409 && code === 'username_taken') {
    return 'That username is already taken.';
  }
  switch (code) {
    case 'invalid_username':
      return 'Username is invalid (3–64 chars, letters/digits/._-).';
    case 'invalid_password':
      return 'Password must be at least 8 characters.';
    case 'invalid_role':
      return 'Role must be Admin or Staff.';
    case 'invalid_permissions':
      return 'Select at least one permission.';
    default:
      return 'Could not create user. Try again.';
  }
}

/**
 * Pure helper shared by screen + tests: the column definition for the
 * users table. Exported so plan 02-03 can add an action column without
 * reshuffling. Labels are plain strings — the screen wraps them in its
 * own render callbacks (which need PERMISSION_LABELS + formatters).
 */
export const USER_TABLE_COLUMN_KEYS = [
  'id',
  'username',
  'role',
  'permissions',
  'is_active',
  'created_at',
] as const;

// =========================================================================
// Plan 02-03 — Edit + Deactivate orchestration
// =========================================================================

/**
 * Client-side self-lockout guard (T-02-14). Returns true when the row id
 * matches the currently signed-in user's id. The UI uses this to disable
 * the Deactivate button on the admin's own row; the backend enforces the
 * same rule with a 409 self_lockout_forbidden response.
 */
export function isSelf(
  currentUser: User | null,
  row: UserListItem
): boolean {
  if (!currentUser) return false;
  return currentUser.id === row.id;
}

/**
 * Edit-form state owned by the screen. `password: ''` is treated as
 * "no change" — the submit path OMITS the `password` key from the PATCH
 * body in that case (T-02-15: backend never sees a zero-length password).
 */
export interface EditUserForm {
  password: string;
  role: Role;
  permissions: Permission[];
  /** Optional — future-proof for a username-edit field. */
  username?: string;
}

export interface EditSubmitCallbacks {
  onValidationError: (errs: UpdateUserErrors) => void;
  onFormError: (copy: string | null) => void;
  onSubmittingChange: (submitting: boolean) => void;
  onSuccess: (row: UserListItem) => void;
  /** Replace the matching row in the table (optimistic in-place update). */
  replaceRow: (row: UserListItem) => void;
}

/**
 * Edit-submit orchestrator. Builds the PATCH body (omitting password when
 * the input is empty), runs client-side validation, calls
 * userService.update, and maps server errors to user copy.
 */
export async function handleEditUserSubmit(
  target: UserListItem,
  form: EditUserForm,
  cb: EditSubmitCallbacks
): Promise<void> {
  // Build patch body — only include password when non-empty (T-02-15).
  const patch: UpdateUserRequest = {
    role: form.role,
    permissions: [...form.permissions],
  };
  if (form.password !== '') {
    patch.password = form.password;
  }
  if (form.username !== undefined && form.username !== target.username) {
    patch.username = form.username;
  }

  const errs = validateUpdateUser(patch);
  cb.onValidationError(errs);
  if (Object.keys(errs).length > 0) return;

  cb.onFormError(null);
  cb.onSubmittingChange(true);

  try {
    const updated = await userService.update(target.id, patch);
    cb.replaceRow(updated);
    cb.onSuccess(updated);
  } catch (e: unknown) {
    const err = e as { response?: { status?: number; data?: { error?: string } } };
    const status = err?.response?.status;
    const code = err?.response?.data?.error;
    cb.onFormError(mapUpdateUserError(status, code));
  } finally {
    cb.onSubmittingChange(false);
  }
}

/**
 * Error-code → user-copy mapping for PATCH /api/users/:id.
 * Extends the plan-02-02 table with user_not_found (404).
 */
export function mapUpdateUserError(
  status: number | undefined,
  code: string | undefined
): string {
  if (status === 409 && code === 'username_taken') {
    return 'That username is already taken.';
  }
  switch (code) {
    case 'invalid_username':
      return 'Username is invalid (3–64 chars, letters/digits/._-).';
    case 'invalid_password':
      return 'Password must be at least 8 characters.';
    case 'invalid_role':
      return 'Role must be Admin or Staff.';
    case 'invalid_permissions':
      return 'Select at least one permission.';
    case 'user_not_found':
      return 'This user no longer exists — refreshing list.';
    default:
      return 'Could not save changes. Try again.';
  }
}

export interface DeactivateCallbacks {
  onLoadingChange: (loading: boolean) => void;
  onError: (copy: string) => void;
  onSuccess: (row: UserListItem) => void;
  replaceRow: (row: UserListItem) => void;
  reloadList: () => Promise<void>;
}

/**
 * Deactivate-confirm orchestrator. Called from the ConfirmDialog's
 * onConfirm. The caller is responsible for not invoking this for the
 * current user's own row (isSelf guard), but the backend will also reject
 * with 409 self_lockout_forbidden as a belt-and-braces check (T-02-14).
 */
export async function handleDeactivateConfirm(
  target: UserListItem,
  cb: DeactivateCallbacks
): Promise<void> {
  cb.onLoadingChange(true);
  try {
    const updated = await userService.deactivate(target.id);
    cb.replaceRow(updated);
    cb.onSuccess(updated);
  } catch (e: unknown) {
    const err = e as { response?: { status?: number; data?: { error?: string } } };
    const status = err?.response?.status;
    const code = err?.response?.data?.error;
    cb.onError(mapDeactivateError(status, code));
    if (code === 'user_not_found') {
      // Stale row — refresh list so the UI converges with server truth.
      try {
        await cb.reloadList();
      } catch {
        /* ignore — onError already fired */
      }
    }
  } finally {
    cb.onLoadingChange(false);
  }
}

/**
 * Error-code → user-copy mapping for POST /api/users/:id/deactivate.
 */
export function mapDeactivateError(
  status: number | undefined,
  code: string | undefined
): string {
  if (status === 409 && code === 'self_lockout_forbidden') {
    return 'You cannot deactivate your own account.';
  }
  switch (code) {
    case 'user_not_found':
      return 'This user no longer exists — refreshing list.';
    default:
      return 'Could not deactivate user. Try again.';
  }
}

// =========================================================================
// Plan 02-04 addendum — Activate (reactivation) orchestration
// =========================================================================

export interface ActivateCallbacks {
  onLoadingChange: (loading: boolean) => void;
  onError: (copy: string) => void;
  onSuccess: (row: UserListItem) => void;
  replaceRow: (row: UserListItem) => void;
  reloadList: () => Promise<void>;
}

/**
 * Activate-confirm orchestrator. Mirrors handleDeactivateConfirm with ONE
 * intentional divergence: there is NO self-lockout guard. An inactive admin
 * cannot authenticate (authMiddleware rejects inactive accounts), so
 * req.user can never be the target of an activate call from their own
 * token — the backend omits the check too (see usersController.activate).
 *
 * Permissions preservation invariant: userModel.setActive only flips the
 * is_active flag; the permissions column is untouched. The sanitized row
 * returned by the server carries the user's prior permission set intact,
 * and replaceRow swaps it into the table in place (no full refetch).
 */
export async function handleActivateConfirm(
  target: UserListItem,
  cb: ActivateCallbacks
): Promise<void> {
  cb.onLoadingChange(true);
  try {
    const updated = await userService.activate(target.id);
    cb.replaceRow(updated);
    cb.onSuccess(updated);
  } catch (e: unknown) {
    const err = e as { response?: { status?: number; data?: { error?: string } } };
    const status = err?.response?.status;
    const code = err?.response?.data?.error;
    cb.onError(mapActivateError(status, code));
    if (code === 'user_not_found') {
      // Stale row — the UI is showing a user the server no longer has.
      // Refresh list so state converges to server truth without corruption.
      try {
        await cb.reloadList();
      } catch {
        /* ignore — onError already fired */
      }
    }
  } finally {
    cb.onLoadingChange(false);
  }
}

/**
 * Error-code → user-copy mapping for POST /api/users/:id/activate.
 * 404 uses friendly "User not found" copy per plan 02-04 addendum.
 */
export function mapActivateError(
  status: number | undefined,
  code: string | undefined
): string {
  switch (code) {
    case 'user_not_found':
      return 'User not found — refreshing list.';
    default:
      return 'Could not activate user. Try again.';
  }
}
