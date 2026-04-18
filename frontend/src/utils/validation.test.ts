import { validateRequired, validateLogin } from './validation';

describe('validateRequired', () => {
  it('returns "<label> is required" for empty string', () => {
    expect(validateRequired('', 'Username')).toBe('Username is required');
  });

  it('treats whitespace-only as empty', () => {
    expect(validateRequired('   ', 'Password')).toBe('Password is required');
  });

  it('returns null for non-empty string', () => {
    expect(validateRequired('hi')).toBeNull();
  });

  it('defaults label to "This field" when not provided', () => {
    expect(validateRequired('')).toBe('This field is required');
  });
});

describe('validateLogin', () => {
  it('returns both errors when both fields are empty', () => {
    expect(validateLogin({ username: '', password: '' })).toEqual({
      username: 'Username is required',
      password: 'Password is required',
    });
  });

  it('returns empty object when both fields are valid', () => {
    expect(validateLogin({ username: 'u', password: 'p' })).toEqual({});
  });

  it('returns only username error when password is valid', () => {
    expect(validateLogin({ username: '', password: 'p' })).toEqual({
      username: 'Username is required',
    });
  });

  it('returns only password error when username is valid', () => {
    expect(validateLogin({ username: 'u', password: '' })).toEqual({
      password: 'Password is required',
    });
  });

  it('treats whitespace-only values as empty', () => {
    expect(validateLogin({ username: '   ', password: '\t' })).toEqual({
      username: 'Username is required',
      password: 'Password is required',
    });
  });
});
