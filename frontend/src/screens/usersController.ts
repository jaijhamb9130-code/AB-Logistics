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
  UserListItem,
} from '../../../shared/types/user';
import { userService } from '../services/userService';
import {
  validateCreateUser,
  type CreateUserErrors,
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
