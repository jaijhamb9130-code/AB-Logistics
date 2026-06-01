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

jest.mock('../src/models/freightModel', () => ({
  generateFromBilty: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  findByBiltyId: jest.fn(),
  // keep the real computeTotals — we exercise it directly below
  computeTotals: jest.requireActual('../src/models/freightModel').computeTotals,
}));

jest.mock('../src/db/pool', () => ({
  execute: jest.fn(),
  getConnection: jest.fn(),
  end: jest.fn(),
}));

const request = require('supertest');
const userModel = require('../src/models/userModel');
const freightModel = require('../src/models/freightModel');
const { signAccessToken } = require('../src/utils/jwt');

let app;

beforeAll(() => {
  app = require('../src/app');
});

beforeEach(() => {
  Object.values(userModel).forEach((fn) => fn.mockReset && fn.mockReset());
  // computeTotals is real — don't reset it; reset only the mocked jest.fns.
  ['generateFromBilty', 'findAll', 'findById', 'findByBiltyId'].forEach((k) => {
    freightModel[k].mockReset && freightModel[k].mockReset();
  });
});

// ---- auth helpers ---------------------------------------------------------

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
  const row = userRow({ id: 1, role: 'admin', permissions: ['*'] });
  userModel.findById.mockResolvedValueOnce(row);
  return signAccessToken({ id: row.id, role: row.role });
}

function staffFreightReadAuth() {
  const row = userRow({
    id: 2, username: 'joe', role: 'staff', permissions: ['freight.read'],
  });
  userModel.findById.mockResolvedValueOnce(row);
  return signAccessToken({ id: row.id, role: row.role });
}

function staffNoPermsAuth() {
  const row = userRow({ id: 3, username: 'ann', role: 'staff', permissions: [] });
  userModel.findById.mockResolvedValueOnce(row);
  return signAccessToken({ id: row.id, role: row.role });
}

// ---- tests ----------------------------------------------------------------

describe('freight — POST /api/freight/generate', () => {
  test('201 with memo when bilty exists and no memo yet; model called with bilty_id', async () => {
    const token = adminAuth();
    freightModel.generateFromBilty.mockResolvedValueOnce({
      id: 9,
      memo_no: 'FM-2026-000001',
      bilty_id: 5,
      memo_date: '2026-04-18',
      freight_total: 1000,
      net_payable: 1000,
    });

    const res = await request(app)
      .post('/api/freight/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ bilty_id: 5 });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(expect.objectContaining({
      id: 9,
      memo_no: 'FM-2026-000001',
      bilty_id: 5,
      freight_total: 1000,
      net_payable: 1000,
    }));
    expect(freightModel.generateFromBilty).toHaveBeenCalledWith(5, 1);
  });

  test('409 memo_exists when a memo already exists for the bilty', async () => {
    const token = adminAuth();
    const err = new Error('memo_exists');
    err.code = 'memo_exists';
    freightModel.generateFromBilty.mockRejectedValueOnce(err);

    const res = await request(app)
      .post('/api/freight/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ bilty_id: 5 });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'memo_exists' });
  });

  test('404 when referenced bilty does not exist', async () => {
    const token = adminAuth();
    const err = new Error('bilty_not_found');
    err.code = 'bilty_not_found';
    freightModel.generateFromBilty.mockRejectedValueOnce(err);

    const res = await request(app)
      .post('/api/freight/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ bilty_id: 999 });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'bilty_not_found' });
  });

  test('400 invalid_bilty_id when body missing/garbage', async () => {
    const token = adminAuth();
    const res = await request(app)
      .post('/api/freight/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_bilty_id' });
    expect(freightModel.generateFromBilty).not.toHaveBeenCalled();
  });

  test('403 forbidden without bilty.edit (staff with only freight.read)', async () => {
    const token = staffFreightReadAuth(); // read, not edit
    const res = await request(app)
      .post('/api/freight/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ bilty_id: 5 });
    expect(res.status).toBe(403);
    expect(freightModel.generateFromBilty).not.toHaveBeenCalled();
  });
});

describe('freight — GET /api/freight (list)', () => {
  test('200 array passthrough from model', async () => {
    const token = adminAuth();
    freightModel.findAll.mockResolvedValueOnce([
      {
        id: 1, memo_no: 'FM-2026-000001', bilty_id: 5, bilty_no: 'BL-2026-000005',
        consignor: 'Acme', truck_no: 'DL-01',
        freight_total: '1000.00', net_payable: '1000.00',
        created_at: '2026-04-18T00:00:00.000Z',
      },
    ]);

    const res = await request(app)
      .get('/api/freight')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toEqual(expect.objectContaining({
      id: 1, memo_no: 'FM-2026-000001', bilty_no: 'BL-2026-000005',
    }));
  });

  test('403 when caller lacks freight.read', async () => {
    const token = staffNoPermsAuth();
    const res = await request(app)
      .get('/api/freight')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('freight — GET /api/freight/:id and /by-bilty/:biltyId', () => {
  test('GET /:id 200 returns memo + bilty snapshot', async () => {
    const token = adminAuth();
    freightModel.findById.mockResolvedValueOnce({
      id: 1, memo_no: 'FM-2026-000001', bilty_id: 5,
      freight_total: '1000.00', net_payable: '1000.00',
      bilty: {
        id: 5, bilty_no: 'BL-2026-000005', consignor: 'Acme', truck_no: 'DL-01',
        items: [{ qty: 10, rate: 100 }],
      },
    });

    const res = await request(app)
      .get('/api/freight/1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.memo_no).toBe('FM-2026-000001');
    expect(res.body.bilty.bilty_no).toBe('BL-2026-000005');
  });

  test('GET /:id 404 memo_not_found on unknown id', async () => {
    const token = adminAuth();
    freightModel.findById.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/freight/999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'memo_not_found' });
  });

  test('GET /by-bilty/:biltyId 200 returns the row for that bilty', async () => {
    const token = adminAuth();
    freightModel.findByBiltyId.mockResolvedValueOnce({
      id: 1, memo_no: 'FM-2026-000001', bilty_id: 5,
    });
    const res = await request(app)
      .get('/api/freight/by-bilty/5')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.bilty_id).toBe(5);
  });
});

describe('freight — computeTotals math (FREIGHT-02, FREIGHT-03)', () => {
  // Exercise the real function directly so the math rule is pinned.
  const { computeTotals } = jest.requireActual('../src/models/freightModel');

  test('freight_total = SUM(qty × rate); net_payable = freight_total', () => {
    const t = computeTotals({
      items: [
        { qty: 10, rate: 100 },    //  1,000
        { qty: '5', rate: '20' },  //    100
        { qty: 3, rate: 250 },     //    750
      ],
    });
    expect(t.freight_total).toBe(1850);
    expect(t.net_payable).toBe(1850);
  });

  test('handles empty items array — all totals 0', () => {
    expect(computeTotals({ items: [] })).toEqual({
      freight_total: 0, net_payable: 0,
    });
  });

  test('rounds to 2dp to match DECIMAL(12,2) storage', () => {
    const t = computeTotals({
      items: [{ qty: 3, rate: 33.33 }],        // 99.99
    });
    expect(t.freight_total).toBe(99.99);
    expect(t.net_payable).toBe(99.99);
  });
});
