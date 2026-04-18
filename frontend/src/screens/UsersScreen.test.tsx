/**
 * UsersScreen — screen-level behaviour tests (plan 02-02 / Task 2).
 *
 * The project's jest setup is `ts-jest` + `testEnvironment: 'node'` (see
 * frontend/package.json) — React Native's renderer is not available. Per the
 * plan's fallback clause ("if neither [@testing-library/react-native nor
 * jest-expo] is installed, stub `userService` and assert state directly"),
 * these tests cover the screen's orchestration logic through the pure
 * `handleCreateUserSubmit` controller that `UsersScreen.tsx` delegates to.
 *
 * The controller owns: validation gate, userService.create call, list
 * refresh, 409 username_taken mapping, generic server-error copy, and the
 * reset-form / close-modal callbacks. Every behaviour bullet in the plan
 * (D–F + list-load happy path) is exercised here.
 */

import {
  handleCreateUserSubmit,
  handleEditUserSubmit,
  handleDeactivateConfirm,
  isSelf,
  mapCreateUserError,
  mapUpdateUserError,
  mapDeactivateError,
} from './usersController';
import type { User, UserListItem } from '../../../shared/types/user';

// ---- Mock the service at module level (Test E + F precondition) ----------
jest.mock('../services/userService', () => ({
  userService: {
    list: jest.fn(),
    create: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { userService } = require('../services/userService') as {
  userService: {
    list: jest.Mock;
    create: jest.Mock;
    get: jest.Mock;
    update: jest.Mock;
    deactivate: jest.Mock;
  };
};

const validRow: UserListItem = {
  id: 42,
  username: 'joe',
  role: 'staff',
  permissions: ['bilty.read'],
  is_active: true,
  created_at: '2026-04-18T00:00:00.000Z',
};

const validForm = {
  username: 'joe',
  password: 'longenough',
  role: 'staff' as const,
  permissions: ['bilty.read'] as const,
};

function makeCallbacks() {
  return {
    onValidationError: jest.fn(),
    onFormError: jest.fn(),
    onSubmittingChange: jest.fn(),
    onSuccess: jest.fn(),
    reloadList: jest.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// -------------------------------------------------------------------------
// Test D — invalid form is short-circuited (userService.create NOT called)
// -------------------------------------------------------------------------
describe('handleCreateUserSubmit — invalid form', () => {
  it('surfaces validation errors and does NOT call userService.create', async () => {
    const cb = makeCallbacks();

    await handleCreateUserSubmit(
      { username: '', password: '', role: '', permissions: [] },
      cb
    );

    expect(cb.onValidationError).toHaveBeenCalledWith({
      username: 'required',
      password: 'required',
      role: 'invalid_value',
      permissions: 'required',
    });
    expect(userService.create).not.toHaveBeenCalled();
    expect(cb.onSuccess).not.toHaveBeenCalled();
    expect(cb.reloadList).not.toHaveBeenCalled();
  });
});

// -------------------------------------------------------------------------
// Test E — valid form calls userService.create exactly once, then reloads
// -------------------------------------------------------------------------
describe('handleCreateUserSubmit — happy path', () => {
  it('calls userService.create with trimmed username then refreshes list', async () => {
    userService.create.mockResolvedValueOnce(validRow);
    const cb = makeCallbacks();

    await handleCreateUserSubmit(
      { ...validForm, username: '  joe  ', permissions: [...validForm.permissions] },
      cb
    );

    expect(userService.create).toHaveBeenCalledTimes(1);
    expect(userService.create).toHaveBeenCalledWith({
      username: 'joe', // trimmed
      password: 'longenough',
      role: 'staff',
      permissions: ['bilty.read'],
    });
    expect(cb.reloadList).toHaveBeenCalledTimes(1);
    expect(cb.onSuccess).toHaveBeenCalledWith(validRow);
    expect(cb.onFormError).toHaveBeenCalledWith(null); // cleared before submit
    expect(cb.onSubmittingChange).toHaveBeenNthCalledWith(1, true);
    expect(cb.onSubmittingChange).toHaveBeenLastCalledWith(false);
  });
});

// -------------------------------------------------------------------------
// Test F — 409 username_taken maps to user-copy, modal stays open
// -------------------------------------------------------------------------
describe('handleCreateUserSubmit — 409 username_taken', () => {
  it('maps 409 to "That username is already taken." and does NOT close modal', async () => {
    userService.create.mockRejectedValueOnce({
      response: { status: 409, data: { error: 'username_taken' } },
    });
    const cb = makeCallbacks();

    await handleCreateUserSubmit(
      { ...validForm, permissions: [...validForm.permissions] },
      cb
    );

    expect(userService.create).toHaveBeenCalledTimes(1);
    // Form error set to the user copy — NOT to raw error code.
    expect(cb.onFormError).toHaveBeenLastCalledWith(
      'That username is already taken.'
    );
    // Crucially: no reload, no success → modal stays open.
    expect(cb.reloadList).not.toHaveBeenCalled();
    expect(cb.onSuccess).not.toHaveBeenCalled();
    expect(cb.onSubmittingChange).toHaveBeenLastCalledWith(false);
  });
});

// -------------------------------------------------------------------------
// Error-code → user-copy mapping coverage (per plan's mapping table)
// -------------------------------------------------------------------------
describe('mapCreateUserError', () => {
  it('maps invalid_username', () => {
    expect(mapCreateUserError(400, 'invalid_username')).toBe(
      'Username is invalid (3–64 chars, letters/digits/._-).'
    );
  });

  it('maps invalid_password', () => {
    expect(mapCreateUserError(400, 'invalid_password')).toBe(
      'Password must be at least 8 characters.'
    );
  });

  it('maps invalid_role', () => {
    expect(mapCreateUserError(400, 'invalid_role')).toBe(
      'Role must be Admin or Staff.'
    );
  });

  it('maps invalid_permissions', () => {
    expect(mapCreateUserError(400, 'invalid_permissions')).toBe(
      'Select at least one permission.'
    );
  });

  it('maps 409 username_taken', () => {
    expect(mapCreateUserError(409, 'username_taken')).toBe(
      'That username is already taken.'
    );
  });

  it('falls back to generic copy for unknown error', () => {
    expect(mapCreateUserError(500, undefined)).toBe(
      'Could not create user. Try again.'
    );
    expect(mapCreateUserError(400, 'weird_code_not_in_map')).toBe(
      'Could not create user. Try again.'
    );
  });
});

// =========================================================================
// Plan 02-03 / Task 2 — Edit + Deactivate + Self-lockout orchestration
// =========================================================================

const adminSelf: User = {
  id: 1,
  username: 'admin',
  role: 'admin',
  permissions: ['*'],
  is_active: true,
  created_at: '2026-04-18T00:00:00.000Z',
};

const staffRow: UserListItem = {
  id: 42,
  username: 'joe',
  role: 'staff',
  permissions: ['bilty.read'],
  is_active: true,
  created_at: '2026-04-18T00:00:00.000Z',
};

function makeEditCallbacks() {
  return {
    onValidationError: jest.fn(),
    onFormError: jest.fn(),
    onSubmittingChange: jest.fn(),
    onSuccess: jest.fn(),
    replaceRow: jest.fn(),
  };
}

function makeDeactivateCallbacks() {
  return {
    onLoadingChange: jest.fn(),
    onError: jest.fn(),
    onSuccess: jest.fn(),
    replaceRow: jest.fn(),
    reloadList: jest.fn().mockResolvedValue(undefined),
  };
}

// -------------------------------------------------------------------------
// Test G — isSelf helper (client-side self-lockout guard, T-02-14)
// -------------------------------------------------------------------------
describe('isSelf (client self-lockout guard)', () => {
  it('returns true when the row id matches the current user id', () => {
    expect(isSelf(adminSelf, { ...staffRow, id: 1 })).toBe(true);
  });

  it('returns false when the row id does not match', () => {
    expect(isSelf(adminSelf, staffRow)).toBe(false);
  });

  it('returns false when there is no current user', () => {
    expect(isSelf(null, staffRow)).toBe(false);
  });
});

// -------------------------------------------------------------------------
// Test H — Edit submit: OMITS password key when password input is empty
// -------------------------------------------------------------------------
describe('handleEditUserSubmit — empty password means no change', () => {
  it('does NOT include password in the PATCH body when password is ""', async () => {
    userService.update.mockResolvedValueOnce({ ...staffRow, role: 'staff' });
    const cb = makeEditCallbacks();

    await handleEditUserSubmit(
      staffRow,
      { password: '', role: 'staff', permissions: ['bilty.read'] },
      cb
    );

    expect(userService.update).toHaveBeenCalledTimes(1);
    const [id, body] = userService.update.mock.calls[0];
    expect(id).toBe(42);
    expect(body).toEqual({ role: 'staff', permissions: ['bilty.read'] });
    expect(Object.prototype.hasOwnProperty.call(body, 'password')).toBe(false);
  });
});

// -------------------------------------------------------------------------
// Test I — Edit submit: includes password when non-empty
// -------------------------------------------------------------------------
describe('handleEditUserSubmit — non-empty password is sent', () => {
  it('includes password in the PATCH body when supplied', async () => {
    userService.update.mockResolvedValueOnce(staffRow);
    const cb = makeEditCallbacks();

    await handleEditUserSubmit(
      staffRow,
      { password: 'newpass12', role: 'staff', permissions: ['bilty.read'] },
      cb
    );

    const [, body] = userService.update.mock.calls[0];
    expect(body).toEqual({
      role: 'staff',
      permissions: ['bilty.read'],
      password: 'newpass12',
    });
  });
});

// -------------------------------------------------------------------------
// Test J — Edit submit: role change is applied via in-place row replacement
// -------------------------------------------------------------------------
describe('handleEditUserSubmit — happy path in-place update', () => {
  it('calls replaceRow with the updated user on success', async () => {
    const updated = { ...staffRow, role: 'admin' as const };
    userService.update.mockResolvedValueOnce(updated);
    const cb = makeEditCallbacks();

    await handleEditUserSubmit(
      staffRow,
      { password: '', role: 'admin', permissions: ['bilty.read'] },
      cb
    );

    expect(cb.replaceRow).toHaveBeenCalledWith(updated);
    expect(cb.onSuccess).toHaveBeenCalledWith(updated);
    expect(cb.onFormError).toHaveBeenCalledWith(null);
    expect(cb.onSubmittingChange).toHaveBeenLastCalledWith(false);
  });
});

// -------------------------------------------------------------------------
// Test K — Edit submit: 409 username_taken surfaces inline
// -------------------------------------------------------------------------
describe('handleEditUserSubmit — 409 username_taken', () => {
  it('maps 409 to "That username is already taken." and does not replace row', async () => {
    userService.update.mockRejectedValueOnce({
      response: { status: 409, data: { error: 'username_taken' } },
    });
    const cb = makeEditCallbacks();

    await handleEditUserSubmit(
      staffRow,
      { password: '', role: 'staff', permissions: ['bilty.read'], username: 'existing' },
      cb
    );

    expect(cb.onFormError).toHaveBeenLastCalledWith(
      'That username is already taken.'
    );
    expect(cb.replaceRow).not.toHaveBeenCalled();
    expect(cb.onSuccess).not.toHaveBeenCalled();
  });
});

// -------------------------------------------------------------------------
// Test L — Edit submit: client-side validation short-circuits (bad password)
// -------------------------------------------------------------------------
describe('handleEditUserSubmit — invalid password is caught client-side', () => {
  it('does NOT call userService.update when password is supplied but <8 chars', async () => {
    const cb = makeEditCallbacks();

    await handleEditUserSubmit(
      staffRow,
      { password: 'short', role: 'staff', permissions: ['bilty.read'] },
      cb
    );

    expect(cb.onValidationError).toHaveBeenCalledWith({ password: 'too_short' });
    expect(userService.update).not.toHaveBeenCalled();
  });
});

// -------------------------------------------------------------------------
// Test M — Deactivate: happy path replaces row with is_active:false
// -------------------------------------------------------------------------
describe('handleDeactivateConfirm — happy path', () => {
  it('calls userService.deactivate and replaces the row with is_active:false', async () => {
    const deactivated = { ...staffRow, is_active: false };
    userService.deactivate.mockResolvedValueOnce(deactivated);
    const cb = makeDeactivateCallbacks();

    await handleDeactivateConfirm(staffRow, cb);

    expect(userService.deactivate).toHaveBeenCalledWith(42);
    expect(cb.replaceRow).toHaveBeenCalledWith(deactivated);
    expect(cb.onSuccess).toHaveBeenCalledWith(deactivated);
    expect(cb.onLoadingChange).toHaveBeenLastCalledWith(false);
  });
});

// -------------------------------------------------------------------------
// Test N — Deactivate: 409 self_lockout_forbidden surfaces user copy (T-02-14)
// -------------------------------------------------------------------------
describe('handleDeactivateConfirm — 409 self_lockout_forbidden', () => {
  it('surfaces "You cannot deactivate your own account." and does not replace row', async () => {
    userService.deactivate.mockRejectedValueOnce({
      response: { status: 409, data: { error: 'self_lockout_forbidden' } },
    });
    const cb = makeDeactivateCallbacks();

    await handleDeactivateConfirm(staffRow, cb);

    expect(cb.onError).toHaveBeenLastCalledWith(
      'You cannot deactivate your own account.'
    );
    expect(cb.replaceRow).not.toHaveBeenCalled();
    expect(cb.onSuccess).not.toHaveBeenCalled();
  });
});

// -------------------------------------------------------------------------
// mapUpdateUserError / mapDeactivateError — error-code copy tables
// -------------------------------------------------------------------------
describe('mapUpdateUserError', () => {
  it('maps 409 username_taken', () => {
    expect(mapUpdateUserError(409, 'username_taken')).toBe(
      'That username is already taken.'
    );
  });

  it('maps invalid_password', () => {
    expect(mapUpdateUserError(400, 'invalid_password')).toBe(
      'Password must be at least 8 characters.'
    );
  });

  it('maps user_not_found (404)', () => {
    expect(mapUpdateUserError(404, 'user_not_found')).toBe(
      'This user no longer exists — refreshing list.'
    );
  });

  it('falls back for unknown codes', () => {
    expect(mapUpdateUserError(500, undefined)).toBe(
      'Could not save changes. Try again.'
    );
  });
});

describe('mapDeactivateError', () => {
  it('maps self_lockout_forbidden', () => {
    expect(mapDeactivateError(409, 'self_lockout_forbidden')).toBe(
      'You cannot deactivate your own account.'
    );
  });

  it('maps user_not_found', () => {
    expect(mapDeactivateError(404, 'user_not_found')).toBe(
      'This user no longer exists — refreshing list.'
    );
  });

  it('falls back for unknown codes', () => {
    expect(mapDeactivateError(500, undefined)).toBe(
      'Could not deactivate user. Try again.'
    );
  });
});
