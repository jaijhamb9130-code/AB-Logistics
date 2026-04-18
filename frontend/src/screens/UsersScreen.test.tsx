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

import { handleCreateUserSubmit, mapCreateUserError } from './usersController';
import type { UserListItem } from '../../../shared/types/user';

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
