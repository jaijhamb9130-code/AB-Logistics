'use strict';

// Must set env BEFORE importing app (config/env.js caches these).
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '7d';
process.env.DATABASE_URL = 'mysql://test:test@localhost:3306/test';
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGIN = 'http://localhost:19006';

// Mock userModel before app requires anything transitive
jest.mock('../src/models/userModel', () => ({
  findByUsername: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
}));

// Mock the DB pool so no real connection is attempted
jest.mock('../src/db/pool', () => ({
  execute: jest.fn(),
  end: jest.fn(),
}));

const request = require('supertest');
const bcrypt = require('bcrypt');
const userModel = require('../src/models/userModel');
const { signAccessToken, signRefreshToken } = require('../src/utils/jwt');
const { resetLoginLimiter } = require('../src/middleware/rateLimit');

let app;

beforeAll(async () => {
  app = require('../src/app');
});

function makeUserRow({ id = 1, username = 'admin', role = 'admin', is_active = 1, permissions = [] } = {}, password = 'correct-horse') {
  const password_hash = bcrypt.hashSync(password, 10);
  return {
    id,
    username,
    password_hash,
    role,
    permissions: JSON.stringify(permissions),
    is_active,
    created_at: new Date().toISOString(),
  };
}

beforeEach(() => {
  userModel.findByUsername.mockReset();
  userModel.findById.mockReset();
  userModel.create.mockReset();
  resetLoginLimiter();
});

describe('POST /api/auth/login', () => {
  test('400 when body is malformed', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual(expect.objectContaining({ error: expect.any(String) }));
  });

  test('200 + accessToken + httpOnly refresh cookie on valid creds', async () => {
    const row = makeUserRow({ id: 1, username: 'admin', role: 'admin' }, 'secret');
    userModel.findByUsername.mockResolvedValueOnce(row);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'secret' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toEqual(expect.objectContaining({
      id: 1,
      username: 'admin',
      role: 'admin',
    }));
    expect(res.body.user.password_hash).toBeUndefined();

    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookie = setCookie.find((c) => c.startsWith('refreshToken='));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/auth/i);
  });

  test('401 on wrong password — no Set-Cookie', async () => {
    const row = makeUserRow({}, 'secret');
    userModel.findByUsername.mockResolvedValueOnce(row);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'invalid_credentials' });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  test('401 when user does not exist (same message — no enumeration)', async () => {
    userModel.findByUsername.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ghost', password: 'x' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'invalid_credentials' });
  });

  test('403 when user is_active=0', async () => {
    const row = makeUserRow({ is_active: 0 }, 'secret');
    userModel.findByUsername.mockResolvedValueOnce(row);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'secret' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'account_disabled' });
  });
});

describe('POST /api/auth/refresh', () => {
  test('401 without cookie', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  test('200 + new accessToken with valid refresh cookie', async () => {
    const row = makeUserRow({ id: 1, role: 'admin' });
    userModel.findById.mockResolvedValueOnce(row);
    const refresh = signRefreshToken({ id: 1 });

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [`refreshToken=${refresh}`]);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  test('401 when refresh token is garbage', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', ['refreshToken=not-a-jwt']);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  test('204 + clears refresh cookie', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(204);
    const setCookie = res.headers['set-cookie'] || [];
    const cleared = setCookie.find((c) => c.startsWith('refreshToken='));
    expect(cleared).toBeDefined();
    // cleared cookie has empty value OR expires in the past
    expect(cleared).toMatch(/refreshToken=;|Expires=Thu, 01 Jan 1970/i);
  });
});

describe('GET /api/auth/me (authMiddleware)', () => {
  test('401 without Authorization header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'missing_token' });
  });

  test('401 with malformed bearer', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'invalid_token' });
  });

  test('401 when user no longer exists / is_active=0', async () => {
    userModel.findById.mockResolvedValueOnce(null);
    const token = signAccessToken({ id: 1, role: 'admin' });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'invalid_token' });
  });

  test('200 returns sanitized user when token valid', async () => {
    const row = makeUserRow({ id: 1, role: 'admin' });
    // authMiddleware calls findById — it already returns a row without password_hash
    const { password_hash: _ph, ...sanitized } = row;
    userModel.findById.mockResolvedValueOnce(sanitized);
    const token = signAccessToken({ id: 1, role: 'admin' });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('admin');
    expect(res.body.password_hash).toBeUndefined();
  });
});

describe('roleMiddleware (admin-only route)', () => {
  test('staff token gets 403', async () => {
    const row = makeUserRow({ id: 2, username: 'joe', role: 'staff', permissions: [] });
    const { password_hash: _p, ...sanitized } = row;
    userModel.findById.mockResolvedValueOnce(sanitized);
    const token = signAccessToken({ id: 2, role: 'staff' });

    const res = await request(app)
      .get('/api/auth/_admin-only-test')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
  });

  test('admin token gets 200', async () => {
    const row = makeUserRow({ id: 1, role: 'admin' });
    const { password_hash: _p, ...sanitized } = row;
    userModel.findById.mockResolvedValueOnce(sanitized);
    const token = signAccessToken({ id: 1, role: 'admin' });

    const res = await request(app)
      .get('/api/auth/_admin-only-test')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('login rate limit (10 per 15 min per IP)', () => {
  test('11th login attempt returns 429', async () => {
    userModel.findByUsername.mockResolvedValue(null); // always invalid → 401, but we're counting requests
    // Fresh supertest agent per test — but rate limit is keyed by IP which is constant in supertest
    for (let i = 0; i < 10; i += 1) {
      const res = await request(app).post('/api/auth/login').send({ username: 'x', password: 'y' });
      expect([401, 400]).toContain(res.status);
    }
    const res = await request(app).post('/api/auth/login').send({ username: 'x', password: 'y' });
    expect(res.status).toBe(429);
  });
});
