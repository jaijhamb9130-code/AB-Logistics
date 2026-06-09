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
  getBiltyTypeId: jest.fn(),
  createWithChildren: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
}));

jest.mock('../src/db/pool', () => ({
  execute: jest.fn(),
  getConnection: jest.fn(),
  end: jest.fn(),
}));

const request = require('supertest');
const userModel = require('../src/models/userModel');
const biltyModel = require('../src/models/biltyModel');
const pool = require('../src/db/pool');
const { signAccessToken } = require('../src/utils/jwt');

let app;
beforeAll(() => {
  app = require('../src/app');
});

beforeEach(() => {
  Object.values(userModel).forEach((fn) => fn.mockReset && fn.mockReset());
  Object.values(biltyModel).forEach((fn) => fn.mockReset && fn.mockReset());
  pool.execute.mockReset && pool.execute.mockReset();
});

function userRow({ id = 1, role = 'admin', permissions = ['*'], is_active = 1 } = {}) {
  return {
    id,
    username: 'u',
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

function staffAuth(permissions = []) {
  const row = userRow({ id: 2, role: 'staff', permissions });
  userModel.findById.mockResolvedValueOnce(row);
  return signAccessToken({ id: row.id, role: row.role });
}

// ---------- GET /api/reports/summary ---------------------------------------

describe('reports — GET /api/reports/summary', () => {
  test('401 without JWT', async () => {
    const res = await request(app).get('/api/reports/summary');
    expect(res.status).toBe(401);
  });

  test('200 admin sees all totals', async () => {
    const token = adminAuth();
    biltyModel.getBiltyTypeId.mockResolvedValueOnce(1);
    
    // admin hits: 
    // 1. countBilties: SELECT COUNT(*) AS c FROM vch_details WHERE vch_type_id = ?
    // 2. countTable('ledger_group'): SELECT COUNT(*) AS c FROM ledger_group
    // 3. countActiveUsers: SELECT COUNT(*) AS c FROM users WHERE is_active = 1
    pool.execute
      .mockResolvedValueOnce([[{ c: 12 }]]) // countBilties
      .mockResolvedValueOnce([[{ c: 7 }]])  // countTable
      .mockResolvedValueOnce([[{ c: 3 }]]); // countActiveUsers

    const res = await request(app)
      .get('/api/reports/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      bilties: 12,
      ledger_groups: 7,
      active_users: 3,
      permissions: {
        bilty: true,
        daybook: true,
        ledgergroup: true,
        user: true,
      },
    });
    expect(biltyModel.getBiltyTypeId).toHaveBeenCalled();
  });

  test('200 staff with only bilty.view sees bilties, zero elsewhere', async () => {
    const token = staffAuth(['bilty.view']);
    biltyModel.getBiltyTypeId.mockResolvedValueOnce(1);
    pool.execute.mockResolvedValueOnce([[{ c: 5 }]]); // countBilties

    const res = await request(app)
      .get('/api/reports/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      bilties: 5,
      ledger_groups: 0,
      active_users: 0,
      permissions: {
        bilty: true,
        daybook: false,
        ledgergroup: false,
        user: false,
      },
    });
    expect(pool.execute).toHaveBeenCalledTimes(1);
  });

  test('200 staff with only ledgergroup.view sees ledger groups, zero elsewhere', async () => {
    const token = staffAuth(['ledgergroup.view']);
    pool.execute.mockResolvedValueOnce([[{ c: 4 }]]); // countTable

    const res = await request(app)
      .get('/api/reports/summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      bilties: 0,
      ledger_groups: 4,
      active_users: 0,
      permissions: {
        bilty: false,
        daybook: false,
        ledgergroup: true,
        user: false,
      },
    });
    expect(pool.execute).toHaveBeenCalledTimes(1);
  });
});

// ---------- GET /api/reports/bilty-register --------------------------------

describe('reports — GET /api/reports/bilty-register', () => {
  test('403 staff without bilty.view', async () => {
    const token = staffAuth([]);
    const res = await request(app)
      .get('/api/reports/bilty-register')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('200 with bilty.view', async () => {
    const token = staffAuth(['bilty.view']);
    biltyModel.getBiltyTypeId.mockResolvedValueOnce(1);
    const mockRow = { id: 1, bilty_no: 'B1', bilty_date: '2026-06-09' };
    pool.execute.mockResolvedValueOnce([[mockRow]]);

    const res = await request(app)
      .get('/api/reports/bilty-register')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [mockRow] });
  });
});

// ---------- GET /api/reports/voucher-register ------------------------------

describe('reports — GET /api/reports/voucher-register', () => {
  test('403 staff without voucher.view', async () => {
    const token = staffAuth([]);
    const res = await request(app)
      .get('/api/reports/voucher-register')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('200 with voucher.view', async () => {
    const token = staffAuth(['voucher.view']);
    const mockRow = { id: 1, vch_no: 'V1', vch_date: '2026-06-09' };
    pool.execute.mockResolvedValueOnce([[mockRow]]);

    const res = await request(app)
      .get('/api/reports/voucher-register')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [mockRow] });
  });
});

// ---------- GET /api/reports/ledger-statement ------------------------------

describe('reports — GET /api/reports/ledger-statement', () => {
  test('400 when ledger_id is missing', async () => {
    const token = adminAuth();
    const res = await request(app)
      .get('/api/reports/ledger-statement')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('200 with ledger_id', async () => {
    const token = adminAuth();
    pool.execute
      .mockResolvedValueOnce([[{ opening: 100 }]]) // opening balance
      .mockResolvedValueOnce([[{ vch_id: 1, vch_no: 'V1', vch_date: '2026-06-09', amount: 50, particulars: 'XYZ' }]]) // entries
      .mockResolvedValueOnce([[{ name: 'Cash' }]]); // ledger name

    const res = await request(app)
      .get('/api/reports/ledger-statement?ledger_id=123')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({
      ledger_name: 'Cash',
      opening: 100,
      entries: [
        { vch_id: 1, vch_no: 'V1', vch_date: '2026-06-09', amount: 50, particulars: 'XYZ', running_balance: 150 }
      ],
      debit_total: 50,
      credit_total: 0,
      closing: 150,
    });
  });
});

// ---------- GET /api/reports/group-summary ---------------------------------

describe('reports — GET /api/reports/group-summary', () => {
  test('403 staff without voucher.view', async () => {
    const token = staffAuth([]);
    const res = await request(app)
      .get('/api/reports/group-summary')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('200 with voucher.view', async () => {
    const token = staffAuth(['voucher.view']);
    const mockRow = { group_id: 1, group_name: 'Assets', ledger_count: 2 };
    pool.execute.mockResolvedValueOnce([[mockRow]]);

    const res = await request(app)
      .get('/api/reports/group-summary')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: [mockRow] });
  });
});

// ---------- GET /api/reports/group-ledgers ---------------------------------

describe('reports — GET /api/reports/group-ledgers', () => {
  test('400 when group_id is missing', async () => {
    const token = adminAuth();
    const res = await request(app)
      .get('/api/reports/group-ledgers')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('200 with group_id', async () => {
    const token = adminAuth();
    const mockRow = { ledger_id: 1, ledger_name: 'Cash', opening: 10, debit_total: 5, credit_total: 2, closing: 13 };
    pool.execute
      .mockResolvedValueOnce([[mockRow]]) // ledgers in group
      .mockResolvedValueOnce([[{ group_name: 'Assets' }]]); // group name

    const res = await request(app)
      .get('/api/reports/group-ledgers?group_id=123')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: [mockRow],
      group_name: 'Assets'
    });
  });
});
