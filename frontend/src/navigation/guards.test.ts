/**
 * Unit tests for canAccessTab — covers the 5 role/tab cases from plan <behavior>.
 * Pure function, no RN / navigation mocks needed.
 */

import { canAccessTab } from './guards';

describe('canAccessTab', () => {
  test('admin can access Dashboard', () => {
    expect(canAccessTab('Dashboard', { role: 'admin' })).toBe(true);
  });

  test('staff CANNOT access Dashboard', () => {
    expect(canAccessTab('Dashboard', { role: 'staff' })).toBe(false);
  });

  test('admin can access Users', () => {
    expect(canAccessTab('Users', { role: 'admin' })).toBe(true);
  });

  test('staff CANNOT access Users', () => {
    expect(canAccessTab('Users', { role: 'staff' })).toBe(false);
  });

  test('unauthenticated (null) CANNOT access Users', () => {
    expect(canAccessTab('Users', null)).toBe(false);
  });

  test('unauthenticated (null) CANNOT access Dashboard either', () => {
    // defence-in-depth: without a user we render nothing
    expect(canAccessTab('Dashboard', null)).toBe(false);
  });
});
