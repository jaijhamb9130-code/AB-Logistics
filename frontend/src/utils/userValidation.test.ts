/**
 * Pure unit tests for the user-form validators (plan 02-02 / Task 1).
 *
 * These validators are UX-only: the backend (plan 02-01) is authoritative
 * (T-02-10). Every case here mirrors a rule enforced server-side so the
 * user sees fast local feedback without trusting client validation alone.
 */

import {
  validateUsername,
  validatePassword,
  validateRole,
  validatePermissions,
  validateCreateUser,
} from './userValidation';

describe('validateUsername', () => {
  it('returns "required" for empty string', () => {
    expect(validateUsername('')).toBe('required');
  });

  it('returns "too_short" for 2 chars', () => {
    expect(validateUsername('ab')).toBe('too_short');
  });

  it('returns "too_long" for >64 chars', () => {
    expect(validateUsername('a'.repeat(65))).toBe('too_long');
  });

  it('returns "invalid_format" for disallowed chars', () => {
    expect(validateUsername('!!!')).toBe('invalid_format');
  });

  it('returns null for valid "good_user.1"', () => {
    expect(validateUsername('good_user.1')).toBeNull();
  });

  it('accepts hyphens and dots and underscores', () => {
    expect(validateUsername('a.b-c_d')).toBeNull();
  });
});

describe('validatePassword', () => {
  it('returns "required" for empty string', () => {
    expect(validatePassword('')).toBe('required');
  });

  it('returns "too_short" for <8 chars', () => {
    expect(validatePassword('short')).toBe('too_short');
  });

  it('returns null for >=8 chars', () => {
    expect(validatePassword('longenough')).toBeNull();
  });
});

describe('validateRole', () => {
  it('accepts admin', () => {
    expect(validateRole('admin')).toBeNull();
  });

  it('accepts staff', () => {
    expect(validateRole('staff')).toBeNull();
  });

  it('rejects empty', () => {
    expect(validateRole('')).toBe('invalid_value');
  });

  it('rejects unknown role', () => {
    expect(validateRole('superadmin')).toBe('invalid_value');
  });
});

describe('validatePermissions', () => {
  it('returns "required" for empty array', () => {
    expect(validatePermissions([])).toBe('required');
  });

  it('returns null for a single permission', () => {
    expect(validatePermissions(['bilty.read'])).toBeNull();
  });

  it('accepts wildcard', () => {
    expect(validatePermissions(['*'])).toBeNull();
  });
});

describe('validateCreateUser', () => {
  const valid = {
    username: 'good',
    password: 'longenough',
    role: 'staff' as const,
    permissions: ['bilty.read'] as const,
  };

  it('returns empty object for valid input', () => {
    expect(validateCreateUser({ ...valid, permissions: ['bilty.read'] })).toEqual({});
  });

  it('flags empty username', () => {
    expect(
      validateCreateUser({ ...valid, username: '', permissions: ['bilty.read'] })
    ).toEqual({ username: 'required' });
  });

  it('flags empty permissions', () => {
    expect(
      validateCreateUser({ ...valid, permissions: [] })
    ).toEqual({ permissions: 'required' });
  });

  it('flags missing role', () => {
    expect(
      validateCreateUser({ ...valid, role: '', permissions: ['bilty.read'] })
    ).toEqual({ role: 'invalid_value' });
  });

  it('flags short password', () => {
    expect(
      validateCreateUser({ ...valid, password: 'short', permissions: ['bilty.read'] })
    ).toEqual({ password: 'too_short' });
  });

  it('returns multiple errors at once', () => {
    expect(
      validateCreateUser({ username: '', password: '', role: '', permissions: [] })
    ).toEqual({
      username: 'required',
      password: 'required',
      role: 'invalid_value',
      permissions: 'required',
    });
  });
});
