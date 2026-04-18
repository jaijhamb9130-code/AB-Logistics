'use strict';

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

jest.mock('../src/models/orderModel', () => ({
  create: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  updateStatus: jest.fn(),
  assignVehicle: jest.fn(),
  isValidTransition: jest.requireActual('../src/models/orderModel').isValidTransition,
  VALID_STATUSES: jest.requireActual('../src/models/orderModel').VALID_STATUSES,
}));

jest.mock('../src/db/pool', () => ({
  execute: jest.fn(),
  getConnection: jest.fn(),
  end: jest.fn(),
}));

const request = require('supertest');
const userModel = require('../src/models/userModel');
const biltyModel = require('../src/models/biltyModel');
const orderModel = require('../src/models/orderModel');
const pool = require('../src/db/pool');
const { signAccessToken } = require('../src/utils/jwt');

let app;
beforeAll(() => { app = require('../src/app'); });
beforeEach(() => {
  Object.values(userModel).forEach((fn) => fn.mockReset && fn.mockReset());
  ['createWithChildren', 'findAll', 'findById'].forEach((k) => {
    biltyModel[k].mockReset && biltyModel[k].mockReset();
  });
  ['create', 'findAll', 'findById', 'updateStatus', 'assignVehicle'].forEach((k) => {
    orderModel[k].mockReset && orderModel[k].mockReset();
  });
  pool.execute.mockReset && pool.execute.mockReset();
});

function userRow({ id = 1, role = 'admin', permissions = ['*'], is_active = 1 } = {}) {
  return {
    id, username: 'u', role, permissions, is_active,
    created_at: '2026-04-18T00:00:00.000Z',
    updated_at: '2026-04-18T00:00:00.000Z',
  };
}

function adminAuth() {
  const row = userRow({ id: 1, role: 'admin', permissions: ['*'] });
  userModel.findById.mockResolvedValueOnce(row);
  return signAccessToken({ id: row.id, role: row.role });
}

function staffAuth(permissions = []) {
  const row = userRow({ id: 2, role: 'staff', permissions });
  userModel.findById.mockResolvedValueOnce(row);
  return signAccessToken({ id: row.id, role: row.role });
}

// Helper: queue up pool.execute responses for COUNT(*) queries in order.
function queueCounts(...counts) {
  for (const c of counts) {
    pool.execute.mockResolvedValueOnce([[{ c }]]);
  }
}

// ---------- GET /api/reports/summary ---------------------------------------

describe('reports — GET /api/reports/summary', () => {
  test('401 without JWT', async () => {
    const res = await request(app).get('/api/reports/summary');
    expect(res.status).toBe(401);
  });

  test('200 admin sees all totals', async () => {
    const token = adminAuth();
    // admin hits: bilty, freight_memo, orders, vehicles, active_users
    queueCounts(12, 7, 9, 4, 3);

    const res = await request(app)
      .get('/api/reports/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      bilties: 12,
      freight_memos: 7,
      orders: 9,
      vehicles: 4,
      active_users: 3,
    }));
    expect(res.body.permissions).toEqual({
      bilty: true, freight: true, order: true, vehicle: true, report: true,
    });
  });

  test('200 staff with only bilty.read sees bilties + freight, zero elsewhere', async () => {
    const token = staffAuth(['bilty.read']);
    // staff hits only 2 count queries (bilty + freight since freight tracks bilty)
    queueCounts(5, 2);

    const res = await request(app)
      .get('/api/reports/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.bilties).toBe(5);
    expect(res.body.freight_memos).toBe(2);
    expect(res.body.orders).toBe(0);
    expect(res.body.vehicles).toBe(0);
    expect(res.body.active_users).toBe(0);
    expect(res.body.permissions).toEqual({
      bilty: true, freight: true, order: false, vehicle: false, report: false,
    });
    // Confirm we did NOT execute the gated counts
    expect(pool.execute).toHaveBeenCalledTimes(2);
  });

  test('200 staff with vehicle.read sees only vehicles', async () => {
    const token = staffAuth(['vehicle.read']);
    queueCounts(6); // only vehicles

    const res = await request(app)
      .get('/api/reports/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.vehicles).toBe(6);
    expect(res.body.bilties).toBe(0);
    expect(res.body.orders).toBe(0);
    expect(pool.execute).toHaveBeenCalledTimes(1);
  });
});

// ---------- GET /api/reports/history ---------------------------------------

describe('reports — GET /api/reports/history', () => {
  test('401 without JWT', async () => {
    const res = await request(app).get('/api/reports/history');
    expect(res.status).toBe(401);
  });

  test('200 admin gets both arrays', async () => {
    const token = adminAuth();
    const biltyRow = {
      id: 1, bilty_no: 'BL-2026-000001', bilty_date: '2026-04-18',
      consignor: 'Acme', truck_no: 'DL-01', item_count: 2,
      created_at: '2026-04-18T00:00:00.000Z',
    };
    const orderRow = {
      id: 1, order_no: 'OR-2026-000001', order_date: '2026-04-18',
      customer_name: 'Acme', from_loc: 'Delhi', to_loc: 'Mumbai',
      status: 'pending', vehicle_id: null, vehicle_no: null,
      created_by: 1, created_at: '2026-04-18T00:00:00.000Z',
      updated_at: '2026-04-18T00:00:00.000Z',
    };
    biltyModel.findAll.mockResolvedValueOnce([biltyRow]);
    orderModel.findAll.mockResolvedValueOnce([orderRow]);

    const res = await request(app)
      .get('/api/reports/history')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.bilties).toHaveLength(1);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.bilties[0].bilty_no).toBe('BL-2026-000001');
    expect(res.body.orders[0].order_no).toBe('OR-2026-000001');
    expect(res.body.permissions).toEqual({ bilty: true, order: true });
  });

  test('200 staff with only order.read gets orders but empty bilties', async () => {
    const token = staffAuth(['order.read']);
    const orderRow = {
      id: 9, order_no: 'OR-2026-000009', order_date: '2026-04-18',
      customer_name: 'Z', from_loc: null, to_loc: null,
      status: 'pending', vehicle_id: null, vehicle_no: null,
      created_by: 2, created_at: '2026-04-18T00:00:00.000Z',
      updated_at: '2026-04-18T00:00:00.000Z',
    };
    orderModel.findAll.mockResolvedValueOnce([orderRow]);

    const res = await request(app)
      .get('/api/reports/history')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.bilties).toEqual([]);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.permissions).toEqual({ bilty: false, order: true });
    expect(biltyModel.findAll).not.toHaveBeenCalled();
  });

  test('200 caps arrays at 20', async () => {
    const token = adminAuth();
    const bilties = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1, bilty_no: `BL-2026-${String(i + 1).padStart(6, '0')}`,
      bilty_date: '2026-04-18', consignor: 'X', truck_no: 'DL-01',
      item_count: 1, created_at: '2026-04-18T00:00:00.000Z',
    }));
    biltyModel.findAll.mockResolvedValueOnce(bilties);
    orderModel.findAll.mockResolvedValueOnce([]);

    const res = await request(app)
      .get('/api/reports/history')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.bilties).toHaveLength(20);
  });
});
