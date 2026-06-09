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

jest.mock('../src/models/biltyModel', () => ({
  createWithChildren: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
}));

const mockConn = {
  execute: jest.fn(),
  beginTransaction: jest.fn(async () => {}),
  commit: jest.fn(async () => {}),
  rollback: jest.fn(async () => {}),
  release: jest.fn(() => {}),
};

jest.mock('../src/db/pool', () => ({
  execute: jest.fn(),
  getConnection: jest.fn(async () => mockConn),
  end: jest.fn(),
}));

const request = require('supertest');
const userModel = require('../src/models/userModel');
const biltyModel = require('../src/models/biltyModel');
const { signAccessToken } = require('../src/utils/jwt');

let app;

beforeAll(() => {
  app = require('../src/app');
});

beforeEach(() => {
  Object.values(userModel).forEach((fn) => fn.mockReset && fn.mockReset());
  Object.values(biltyModel).forEach((fn) => fn.mockReset && fn.mockReset());
});

// ---- helpers ---------------------------------------------------------------

function userRow({
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
  // authMiddleware hits userModel.findById — mock once for THIS request.
  const row = userRow({ id: 1, role: 'admin', permissions: ['*'] });
  userModel.findById.mockResolvedValueOnce(row);
  return signAccessToken({ id: row.id, role: row.role });
}

function staffWithBiltyViewAuth() {
  const row = userRow({
    id: 2,
    username: 'joe',
    role: 'staff',
    permissions: ['bilty.view'],
  });
  userModel.findById.mockResolvedValueOnce(row);
  return signAccessToken({ id: row.id, role: row.role });
}

function staffNoBiltyAuth() {
  const row = userRow({ id: 3, username: 'ann', role: 'staff', permissions: [] });
  userModel.findById.mockResolvedValueOnce(row);
  return signAccessToken({ id: row.id, role: row.role });
}

const VALID_BODY = {
  header: {
    bilty_no: 'BL-000001',
    bilty_date: '2026-04-18',
    consignor: 'Acme Corp',
    owner_name: 'John',
    agent_name: 'Jane',
    branch: 'Delhi',
    zone_name: 'North',
    truck_no: 'DL-01-AB-1234',
    goods_type: 'Cotton',
    truck_type: '10-wheeler',
  },
  items: [
    { challan_no: 'C1', lr_no: 'L1', from_loc: 'A', to_loc: 'B',
      consignee: 'X', qty: 10, rate: 100, inc_rate: 0, l_rate: 0, e_rate: 0 },
  ],
};

// ---- tests -----------------------------------------------------------------

describe('bilty — auth + permission gates', () => {
  test('GET /api/bilty without Bearer → 401', async () => {
    const res = await request(app).get('/api/bilty');
    expect(res.status).toBe(401);
  });

  test('POST /api/bilty without bilty.create → 403 forbidden', async () => {
    const token = staffWithBiltyViewAuth(); // has view, not create
    const res = await request(app)
      .post('/api/bilty')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'forbidden' });
    expect(biltyModel.createWithChildren).not.toHaveBeenCalled();
  });

  test('GET /api/bilty without bilty.view → 403 forbidden', async () => {
    const token = staffNoBiltyAuth();
    const res = await request(app)
      .get('/api/bilty')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('bilty — POST /api/bilty (create)', () => {
  test('201 with { id, bilty_no } on valid payload; model called with parsed sections', async () => {
    const token = adminAuth();
    biltyModel.createWithChildren.mockResolvedValueOnce({
      id: 7,
      bilty_no: 'BL-2026-000001',
    });

    const res = await request(app)
      .post('/api/bilty')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 7, bilty_no: 'BL-2026-000001' });
    expect(biltyModel.createWithChildren).toHaveBeenCalledTimes(1);
    const arg = biltyModel.createWithChildren.mock.calls[0][0];
    expect(arg.header.consignor).toBe('Acme Corp');
    expect(arg.header.truck_no).toBe('DL-01-AB-1234');
    expect(arg.items).toHaveLength(1);
    expect(arg.userId).toBe(1);
  });

  test('400 invalid_consignor when missing', async () => {
    const token = adminAuth();
    const res = await request(app)
      .post('/api/bilty')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_BODY, header: { ...VALID_BODY.header, consignor: '' } });
    expect(res.status).toBe(400);
    expect(res.body.error.fields['header.consignor']).toBeDefined();
    expect(biltyModel.createWithChildren).not.toHaveBeenCalled();
  });

  test('400 invalid_truck_no when missing', async () => {
    const token = adminAuth();
    const res = await request(app)
      .post('/api/bilty')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_BODY, header: { ...VALID_BODY.header, truck_no: '' } });
    expect(res.status).toBe(400);
    expect(res.body.error.fields['header.truck_no']).toBeDefined();
  });

  test('400 no_items when items array empty', async () => {
    const token = adminAuth();
    const res = await request(app)
      .post('/api/bilty')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_BODY, items: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.items).toBeDefined();
  });

  test('400 invalid_item_qty when an item has negative qty', async () => {
    const token = adminAuth();
    const res = await request(app)
      .post('/api/bilty')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...VALID_BODY,
        items: [{ ...VALID_BODY.items[0], qty: -1 }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.fields['items.0.qty']).toBe('qty cannot be negative');
  });
});

describe('bilty — GET /api/bilty (list)', () => {
  test('200 returns array from model', async () => {
    const token = adminAuth();
    biltyModel.findAll.mockResolvedValueOnce([
      { id: 1, bilty_no: 'BL-2026-000001', bilty_date: '2026-04-18',
        consignor: 'Acme', truck_no: 'DL-01', item_count: 3,
        created_at: '2026-04-18T00:00:00.000Z' },
    ]);

    const res = await request(app)
      .get('/api/bilty')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toEqual(expect.objectContaining({
      id: 1, bilty_no: 'BL-2026-000001', item_count: 3,
    }));
  });
});

describe('bilty — GET /api/bilty/:id', () => {
  test('200 returns header + items array', async () => {
    const token = adminAuth();
    biltyModel.findById.mockResolvedValueOnce({
      id: 5, bilty_no: 'BL-2026-000005', consignor: 'Acme', truck_no: 'DL-01',
      items: [{ id: 1, bilty_id: 5, qty: 10, rate: 100 }],
    });

    const res = await request(app)
      .get('/api/bilty/5')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(5);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  test('404 bilty_not_found on unknown id', async () => {
    const token = adminAuth();
    biltyModel.findById.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/bilty/999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe('Bilty not found');
  });

  test('400 invalid_id on non-numeric :id', async () => {
    const token = adminAuth();
    const res = await request(app)
      .get('/api/bilty/abc')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Invalid id');
  });
});
