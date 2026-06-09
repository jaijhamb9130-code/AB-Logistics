'use strict';

// Must set env BEFORE importing app (config/env.js caches these).
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_TTL = '7d';
process.env.DATABASE_URL = 'mysql://test:test@localhost:3306/test';
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGIN = 'http://localhost:19006';

jest.mock('../src/models/userModel', () => ({
  findByUsername: jest.fn(),
  findByUsernameExcludingId: jest.fn(),
  findById: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  setActive: jest.fn(),
}));

jest.mock('../src/utils/password', () => ({
  hashPassword: jest.fn(async (plain) => `hashed(${plain})`),
  comparePassword: jest.fn(),
}));

jest.mock('../src/db/pool', () => ({
  execute: jest.fn(),
  end: jest.fn(),
}));

const request = require('supertest');
const userModel = require('../src/models/userModel');
const password = require('../src/utils/password');
const { signAccessToken } = require('../src/utils/jwt');

let app;

beforeAll(() => {
  app = require('../src/app');
});

beforeEach(() => {
  Object.values(userModel).forEach((fn) => fn.mockReset && fn.mockReset());
  password.hashPassword.mockReset();
  password.hashPassword.mockImplementation(async (plain) => `hashed(${plain})`);
});

// --- helpers ----------------------------------------------------------------

function sanitizedRow({
  id = 1,
  username = 'admin',
  role = 'admin',
  permissions = ['*'],
  is_active = 1,
} = {}) {
  return {
    id,
    username,
    role,
    permissions,
    is_active,
    created_at: '2026-04-18T00:00:00.000Z',
    updated_at: '2026-04-18T00:00:00.000Z',
  };
}

function adminAuth() {
  // Admin userModel.findById is hit by authMiddleware. Mock it to return
  // a sanitized admin row for THIS request only.
  const row = sanitizedRow({ id: 1, role: 'admin', permissions: ['*'] });
  userModel.findById.mockResolvedValueOnce(row);
  const token = signAccessToken({ id: row.id, role: row.role });
  return { token, row };
}

function staffAuth() {
  const row = sanitizedRow({ id: 2, username: 'joe', role: 'staff', permissions: [] });
  userModel.findById.mockResolvedValueOnce(row);
  const token = signAccessToken({ id: row.id, role: row.role });
  return { token, row };
}

// Walk a response body and throw if any object contains password_hash.
// Use after EVERY assertion that returns a user-shaped body.
function assertNoPasswordHash(body) {
  const walk = (v) => {
    if (v && typeof v === 'object') {
      if (Object.prototype.hasOwnProperty.call(v, 'password_hash')) {
        throw new Error('leaked password_hash in response body');
      }
      Object.values(v).forEach(walk);
    }
  };
  walk(body);
}

// ----------------------------------------------------------------------------

describe('users — authentication + RBAC gates', () => {
  test('GET /api/users with no Bearer → 401 missing_token', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'missing_token' });
  });

  test('GET /api/users/1 with no Bearer → 401 missing_token', async () => {
    const res = await request(app).get('/api/users/1');
    expect(res.status).toBe(401);
  });

  test('POST /api/users with no Bearer → 401 missing_token', async () => {
    const res = await request(app).post('/api/users').send({});
    expect(res.status).toBe(401);
  });

  test('PATCH /api/users/1 with no Bearer → 401 missing_token', async () => {
    const res = await request(app).patch('/api/users/1').send({});
    expect(res.status).toBe(401);
  });

  test('POST /api/users/1/deactivate with no Bearer → 401 missing_token', async () => {
    const res = await request(app).post('/api/users/1/deactivate');
    expect(res.status).toBe(401);
  });

  test('staff token → 403 forbidden on every /api/users route', async () => {
    for (const call of [
      () => request(app).get('/api/users').set('Authorization', `Bearer ${staffAuth().token}`),
      () => request(app).get('/api/users/1').set('Authorization', `Bearer ${staffAuth().token}`),
      () => request(app).post('/api/users').set('Authorization', `Bearer ${staffAuth().token}`).send({}),
      () => request(app).patch('/api/users/1').set('Authorization', `Bearer ${staffAuth().token}`).send({}),
      () => request(app).post('/api/users/1/deactivate').set('Authorization', `Bearer ${staffAuth().token}`),
    ]) {
      const res = await call();
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'forbidden' });
    }
  });
});

describe('users — GET /api/users (list)', () => {
  test('200 returns sanitized array, no password_hash anywhere', async () => {
    const { token } = adminAuth();
    userModel.findAll.mockResolvedValueOnce([
      sanitizedRow({ id: 1, username: 'admin', role: 'admin', permissions: ['*'] }),
      sanitizedRow({ id: 2, username: 'joe', role: 'staff', permissions: ['bilty.read'] }),
    ]);

    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toEqual(expect.objectContaining({ id: 1, username: 'admin', role: 'admin' }));
    expect(res.body[0].is_active).toBe(true);
    assertNoPasswordHash(res.body);
  });
});

describe('users — GET /api/users/:id', () => {
  test('200 returns sanitized user; 404 on unknown id', async () => {
    const { token } = adminAuth();
    userModel.findById.mockResolvedValueOnce(sanitizedRow({ id: 5, username: 'target', role: 'staff', permissions: ['bilty.read'] }));

    const res = await request(app).get('/api/users/5').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({ id: 5, username: 'target', role: 'staff' }));
    assertNoPasswordHash(res.body);

    const { token: t2 } = adminAuth();
    userModel.findById.mockResolvedValueOnce(null);
    const res2 = await request(app).get('/api/users/999').set('Authorization', `Bearer ${t2}`);
    expect(res2.status).toBe(404);
    expect(res2.body).toEqual({ error: 'user_not_found' });
  });

  test('400 invalid_id on non-numeric :id', async () => {
    const { token } = adminAuth();
    const res = await request(app).get('/api/users/abc').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_id' });
  });
});

describe('users — POST /api/users (create)', () => {
  test('201 creates user; hashPassword called, NOT plain password; response sanitized', async () => {
    const { token } = adminAuth();
    userModel.findByUsername.mockResolvedValueOnce(null); // username free
    userModel.create.mockResolvedValueOnce(42);
    userModel.findById.mockResolvedValueOnce(
      sanitizedRow({ id: 42, username: 'newbie', role: 'staff', permissions: ['bilty.view'] })
    );

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'newbie', password: 'supersecret', role: 'staff', permissions: ['bilty.view'] });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(expect.objectContaining({ id: 42, username: 'newbie', role: 'staff' }));
    assertNoPasswordHash(res.body);

    expect(password.hashPassword).toHaveBeenCalledWith('supersecret');
    expect(userModel.create).toHaveBeenCalledTimes(1);
    const createArg = userModel.create.mock.calls[0][0];
    expect(createArg.password_hash).toBe('hashed(supersecret)');
    expect(createArg.password_hash).not.toBe('supersecret');
    expect('password' in createArg).toBe(false);
  });

  test('400 invalid_body for missing/bad fields', async () => {
    const { token } = adminAuth();
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_body' });
  });

  test('400 invalid_password for password shorter than 8 chars', async () => {
    const { token } = adminAuth();
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'newbie', password: 'short', role: 'staff', permissions: [] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_password' });
  });

  test('400 invalid_username for illegal chars', async () => {
    const { token } = adminAuth();
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'bad user!', password: 'supersecret', role: 'staff', permissions: [] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_username' });
  });

  test('400 invalid_role for unknown role', async () => {
    const { token } = adminAuth();
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'newbie', password: 'supersecret', role: 'owner', permissions: [] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_role' });
  });

  test('400 invalid_permissions for permission not in canonical vocab', async () => {
    const { token } = adminAuth();
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'newbie', password: 'supersecret', role: 'staff', permissions: ['bilty.view', 'totally.fake'] });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_permissions' });
  });

  test('409 username_taken when username already exists', async () => {
    const { token } = adminAuth();
    userModel.findByUsername.mockResolvedValueOnce(sanitizedRow({ id: 7, username: 'newbie' }));

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'newbie', password: 'supersecret', role: 'staff', permissions: [] });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'username_taken' });
    expect(userModel.create).not.toHaveBeenCalled();
  });
});

describe('users — PATCH /api/users/:id (update)', () => {
  test('200 updates role and returns sanitized new row', async () => {
    const { token } = adminAuth();
    userModel.update.mockResolvedValueOnce(true);
    userModel.findById.mockResolvedValueOnce(
      sanitizedRow({ id: 5, username: 'target', role: 'staff', permissions: [] })
    );

    const res = await request(app)
      .patch('/api/users/5')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'staff' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('staff');
    assertNoPasswordHash(res.body);
    expect(userModel.update).toHaveBeenCalledWith(5, expect.objectContaining({ role: 'staff' }));
  });

  test('password field is re-hashed via hashPassword — never stored plain', async () => {
    const { token } = adminAuth();
    userModel.update.mockResolvedValueOnce(true);
    userModel.findById.mockResolvedValueOnce(sanitizedRow({ id: 5, username: 'target', role: 'staff' }));

    const res = await request(app)
      .patch('/api/users/5')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'brand-new-pw' });

    expect(res.status).toBe(200);
    expect(password.hashPassword).toHaveBeenCalledWith('brand-new-pw');
    const arg = userModel.update.mock.calls[0][1];
    expect(arg.password_hash).toBe('hashed(brand-new-pw)');
    expect('password' in arg).toBe(false);
  });

  test('404 user_not_found when update affects no rows', async () => {
    const { token } = adminAuth();
    userModel.update.mockResolvedValueOnce(false);

    const res = await request(app)
      .patch('/api/users/999')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'staff' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'user_not_found' });
  });

  test('409 username_taken when new username collides with another user', async () => {
    const { token } = adminAuth();
    userModel.findByUsernameExcludingId.mockResolvedValueOnce(true);

    const res = await request(app)
      .patch('/api/users/5')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'admin' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'username_taken' });
    expect(userModel.update).not.toHaveBeenCalled();
  });

  test('400 invalid_permissions when permissions contain unknown string', async () => {
    const { token } = adminAuth();
    const res = await request(app)
      .patch('/api/users/5')
      .set('Authorization', `Bearer ${token}`)
      .send({ permissions: ['bilty.view', 'rogue.perm'] });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_permissions' });
    expect(userModel.update).not.toHaveBeenCalled();
  });

  test('400 invalid_role for unknown role via PATCH', async () => {
    const { token } = adminAuth();
    const res = await request(app)
      .patch('/api/users/5')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'superuser' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_role' });
  });

  test('400 invalid_body when patch is empty', async () => {
    const { token } = adminAuth();
    const res = await request(app)
      .patch('/api/users/5')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_body' });
  });
});

describe('users — POST /api/users/:id/deactivate', () => {
  test('200 flips is_active to 0 and returns sanitized row', async () => {
    const { token } = adminAuth();
    userModel.setActive.mockResolvedValueOnce(true);
    userModel.findById
      .mockResolvedValueOnce(sanitizedRow({ id: 5, username: 'target', role: 'staff', is_active: 1 }))
      .mockResolvedValueOnce(sanitizedRow({ id: 5, username: 'target', role: 'staff', is_active: 0 }));

    const res = await request(app)
      .post('/api/users/5/deactivate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(false);
    assertNoPasswordHash(res.body);
    expect(userModel.setActive).toHaveBeenCalledWith(5, 0);
  });

  test('404 user_not_found when setActive affects no rows', async () => {
    const { token } = adminAuth();
    userModel.setActive.mockResolvedValueOnce(false);

    const res = await request(app)
      .post('/api/users/999/deactivate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'user_not_found' });
  });
});

describe('users — POST /api/users/:id/activate', () => {
  test('200 flips is_active to 1 and returns sanitized row with preserved permissions', async () => {
    const { token } = adminAuth();
    userModel.setActive.mockResolvedValueOnce(true);
    userModel.findById.mockResolvedValueOnce(
      sanitizedRow({
        id: 5,
        username: 'target',
        role: 'staff',
        permissions: ['bilty.view', 'freight.view'],
        is_active: 1,
      })
    );

    const res = await request(app)
      .post('/api/users/5/activate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(true);
    // Permissions preserved through deactivate → activate round trip.
    expect(res.body.permissions).toEqual(['bilty.view', 'freight.view']);
    assertNoPasswordHash(res.body);
    expect(userModel.setActive).toHaveBeenCalledWith(5, true);
  });

  test('200 idempotent when user is already active (no-op)', async () => {
    const { token } = adminAuth();
    // setActive still returns affectedRows > 0 since UPDATE runs unconditionally.
    userModel.setActive.mockResolvedValueOnce(true);
    userModel.findById.mockResolvedValueOnce(
      sanitizedRow({ id: 5, username: 'target', role: 'staff', permissions: ['bilty.view'], is_active: 1 })
    );

    const res = await request(app)
      .post('/api/users/5/activate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(true);
    expect(userModel.setActive).toHaveBeenCalledWith(5, true);
  });

  test('404 user_not_found when setActive affects no rows', async () => {
    const { token } = adminAuth();
    userModel.setActive.mockResolvedValueOnce(false);

    const res = await request(app)
      .post('/api/users/999/activate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'user_not_found' });
  });

  test('400 invalid_id on non-numeric :id', async () => {
    const { token } = adminAuth();
    const res = await request(app)
      .post('/api/users/abc/activate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_id' });
  });

  test('403 forbidden with staff token', async () => {
    const { token } = staffAuth();
    const res = await request(app)
      .post('/api/users/5/activate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
    expect(userModel.setActive).not.toHaveBeenCalled();
  });

  test('401 missing_token with no Bearer', async () => {
    const res = await request(app).post('/api/users/5/activate');
    expect(res.status).toBe(401);
  });
});

describe('users — self-lockout (USER-05, T-02-04)', () => {
  test('409 self_lockout_forbidden when admin deactivates own id; setActive NOT called', async () => {
    // Admin id 1 tries to deactivate id 1.
    const { token } = adminAuth();

    const res = await request(app)
      .post('/api/users/1/deactivate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'self_lockout_forbidden' });
    expect(userModel.setActive).not.toHaveBeenCalled();
  });
});
