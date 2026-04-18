'use strict';

// Set env BEFORE requiring modules that load env
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '7d';
process.env.DATABASE_URL = 'mysql://test:test@localhost:3306/test';

const jwt = require('jsonwebtoken');

describe('password utils', () => {
  const { hashPassword, comparePassword } = require('../src/utils/password');

  test('hashPassword returns a bcrypt hash with rounds=10', async () => {
    const hash = await hashPassword('hunter2');
    expect(typeof hash).toBe('string');
    // bcrypt rounds=10 yields prefix $2b$10$ (or $2a$10$ on some platforms)
    expect(hash).toMatch(/^\$2[aby]\$10\$/);
  });

  test('comparePassword round-trips', async () => {
    const hash = await hashPassword('hunter2');
    await expect(comparePassword('hunter2', hash)).resolves.toBe(true);
    await expect(comparePassword('wrong', hash)).resolves.toBe(false);
  });
});

describe('jwt utils', () => {
  const {
    signAccessToken,
    signRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
  } = require('../src/utils/jwt');

  test('signAccessToken + verifyAccessToken round-trip with sub and role', () => {
    const token = signAccessToken({ id: 7, role: 'admin' });
    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe(7);
    expect(decoded.role).toBe('admin');
    expect(typeof decoded.exp).toBe('number');
    // exp should be ~15min (900s) from iat
    expect(decoded.exp - decoded.iat).toBeGreaterThanOrEqual(14 * 60);
    expect(decoded.exp - decoded.iat).toBeLessThanOrEqual(16 * 60);
  });

  test('signRefreshToken + verifyRefreshToken round-trip', () => {
    const token = signRefreshToken({ id: 11 });
    const decoded = verifyRefreshToken(token);
    expect(decoded.sub).toBe(11);
    expect(decoded.typ).toBe('refresh');
    // 7d ~ 604800s
    expect(decoded.exp - decoded.iat).toBeGreaterThanOrEqual(6 * 24 * 60 * 60);
  });

  test('verifyAccessToken throws on tampered / wrong-secret token', () => {
    const badToken = jwt.sign({ sub: 1, role: 'admin' }, 'different-secret', { expiresIn: '1m' });
    expect(() => verifyAccessToken(badToken)).toThrow();
  });

  test('access token cannot be verified with refresh secret', () => {
    const token = signAccessToken({ id: 1, role: 'staff' });
    expect(() => verifyRefreshToken(token)).toThrow();
  });

  test('verifyAccessToken throws on garbage input', () => {
    expect(() => verifyAccessToken('not-a-jwt')).toThrow();
  });
});

describe('userModel', () => {
  // Mock the pool before requiring the model
  jest.mock('../src/db/pool', () => ({
    execute: jest.fn(),
    end: jest.fn(),
  }));

  const pool = require('../src/db/pool');
  const userModel = require('../src/models/userModel');

  beforeEach(() => {
    pool.execute.mockReset();
  });

  test('findByUsername returns null when no rows', async () => {
    pool.execute.mockResolvedValueOnce([[], []]);
    const r = await userModel.findByUsername('nope');
    expect(r).toBeNull();
  });

  test('findByUsername returns the first row when found', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 1, username: 'admin', password_hash: 'h', role: 'admin' }], []]);
    const r = await userModel.findByUsername('admin');
    expect(r).toEqual(expect.objectContaining({ id: 1, username: 'admin' }));
  });

  test('findById returns null when missing', async () => {
    pool.execute.mockResolvedValueOnce([[], []]);
    const r = await userModel.findById(999);
    expect(r).toBeNull();
  });

  test('findById SELECT does not include password_hash column', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 1 }], []]);
    await userModel.findById(1);
    const sql = pool.execute.mock.calls[0][0];
    expect(sql).not.toMatch(/password_hash/);
  });

  test('create calls INSERT with JSON.stringified permissions', async () => {
    pool.execute.mockResolvedValueOnce([{ insertId: 42 }, []]);
    const id = await userModel.create({
      username: 'bob',
      password_hash: 'h',
      role: 'staff',
      permissions: ['bilty.view'],
    });
    expect(id).toBe(42);
    const [, params] = pool.execute.mock.calls[0];
    expect(params.perms).toBe(JSON.stringify(['bilty.view']));
  });
});
