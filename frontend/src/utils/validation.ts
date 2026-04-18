/**
 * Pure validation helpers.
 *
 * Used by LoginScreen (Plan 04) and will be reused by any future form
 * that needs "required field" semantics.
 *
 * Rules:
 *  - Empty string           → "<Label> is required"
 *  - Whitespace-only string → "<Label> is required" (trimmed check)
 *  - Anything else          → null (valid)
 */

export const validateRequired = (
  v: string,
  label = 'This field'
): string | null =>
  !v || v.trim().length === 0 ? `${label} is required` : null;

export interface LoginErrors {
  username?: string;
  password?: string;
}

export const validateLogin = (input: {
  username: string;
  password: string;
}): LoginErrors => {
  const errors: LoginErrors = {};
  const u = validateRequired(input.username, 'Username');
  if (u) errors.username = u;
  const p = validateRequired(input.password, 'Password');
  if (p) errors.password = p;
  return errors;
};
