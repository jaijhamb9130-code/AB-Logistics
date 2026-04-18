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

jest.mock('../src/models/orderModel', () => ({
  create: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  updateStatus: jest.fn(),
  assignVehicle: jest.fn(),
  // keep helpers real
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
const orderModel = require('../src/models/orderModel');
const { signAccessToken } = require('../src/utils/jwt');

let app;
beforeAll(() => { app = require('../src/app'); });
beforeEach(() => {
  Object.values(userModel).forEach((fn) => fn.mockReset && fn.mockReset());
  ['create', 'findAll', 'findById', 'updateStatus', 'assignVehicle'].forEach((k) => {
    orderModel[k].mockReset && orderModel[k].mockReset();
  });
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

function staffNoOrderEditAuth() {
  const row = userRow({ id: 2, role: 'staff', permissions: ['order.read'] });
  userModel.findById.mockResolvedValueOnce(row);
  return signAccessToken({ id: row.id, role: row.role });
}

const ORDER_ROW = {
  id: 9,
  order_no: 'OR-2026-000001',
  order_date: '2026-04-18',
  customer_name: 'Acme',
  from_loc: 'Delhi',
  to_loc: 'Mumbai',
  goods_desc: 'Cotton',
  status: 'pending',
  vehicle_id: null,
  vehicle_no: null,
  created_by: 1,
  created_at: '2026-04-18T00:00:00.000Z',
  updated_at: '2026-04-18T00:00:00.000Z',
};

// -- create -----------------------------------------------------------------
describe('orders — POST /api/orders (create)', () => {
  test('201 returns { id, order_no } on valid payload', async () => {
    const token = adminAuth();
    orderModel.create.mockResolvedValueOnce({ id: 9, order_no: 'OR-2026-000001' });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        order_date: '2026-04-18',
        customer_name: 'Acme',
        from_loc: 'Delhi',
        to_loc: 'Mumbai',
        goods_desc: 'Cotton',
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 9, order_no: 'OR-2026-000001' });
    expect(orderModel.create).toHaveBeenCalledTimes(1);
  });

  test('400 invalid_customer_name when missing', async () => {
    const token = adminAuth();
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ customer_name: '' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_customer_name' });
    expect(orderModel.create).not.toHaveBeenCalled();
  });

  test('403 when staff lacks order.edit', async () => {
    const token = staffNoOrderEditAuth();
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ customer_name: 'Acme' });
    expect(res.status).toBe(403);
  });
});

// -- list + get -------------------------------------------------------------
describe('orders — list / get', () => {
  test('GET /api/orders 200 returns array with vehicle_no (LEFT JOIN)', async () => {
    const token = adminAuth();
    orderModel.findAll.mockResolvedValueOnce([
      { ...ORDER_ROW, vehicle_id: 3, vehicle_no: 'DL-01' },
    ]);
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body[0].vehicle_no).toBe('DL-01');
  });

  test('GET /api/orders/:id 200 returns order', async () => {
    const token = adminAuth();
    orderModel.findById.mockResolvedValueOnce(ORDER_ROW);
    const res = await request(app)
      .get('/api/orders/9')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.order_no).toBe('OR-2026-000001');
  });

  test('GET /api/orders/:id 404 when missing', async () => {
    const token = adminAuth();
    orderModel.findById.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/orders/999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'order_not_found' });
  });
});

// -- status transitions ------------------------------------------------------
describe('orders — PATCH /api/orders/:id/status', () => {
  test('200 advances pending → in_progress', async () => {
    const token = adminAuth();
    orderModel.updateStatus.mockResolvedValueOnce(true);
    orderModel.findById.mockResolvedValueOnce({ ...ORDER_ROW, status: 'in_progress' });

    const res = await request(app)
      .patch('/api/orders/9/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'in_progress' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in_progress');
    expect(orderModel.updateStatus).toHaveBeenCalledWith(9, 'in_progress');
  });

  test('400 invalid_status_transition when jumping pending → completed', async () => {
    const token = adminAuth();
    const err = new Error('invalid_status_transition');
    err.code = 'invalid_status_transition';
    orderModel.updateStatus.mockRejectedValueOnce(err);

    const res = await request(app)
      .patch('/api/orders/9/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_status_transition' });
  });
});

// -- assign vehicle ----------------------------------------------------------
describe('orders — PATCH /api/orders/:id/vehicle (assign)', () => {
  test('200 assigns vehicle', async () => {
    const token = adminAuth();
    orderModel.assignVehicle.mockResolvedValueOnce(true);
    orderModel.findById.mockResolvedValueOnce({
      ...ORDER_ROW, vehicle_id: 3, vehicle_no: 'DL-01',
    });

    const res = await request(app)
      .patch('/api/orders/9/vehicle')
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicle_id: 3 });

    expect(res.status).toBe(200);
    expect(res.body.vehicle_id).toBe(3);
    expect(res.body.vehicle_no).toBe('DL-01');
    expect(orderModel.assignVehicle).toHaveBeenCalledWith(9, 3);
  });

  test('404 when vehicle does not exist', async () => {
    const token = adminAuth();
    const err = new Error('vehicle_not_found');
    err.code = 'vehicle_not_found';
    orderModel.assignVehicle.mockRejectedValueOnce(err);

    const res = await request(app)
      .patch('/api/orders/9/vehicle')
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicle_id: 999 });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'vehicle_not_found' });
  });

  test('400 invalid_vehicle_id when body missing', async () => {
    const token = adminAuth();
    const res = await request(app)
      .patch('/api/orders/9/vehicle')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_vehicle_id' });
    expect(orderModel.assignVehicle).not.toHaveBeenCalled();
  });
});

// -- transition rules pinned -------------------------------------------------
describe('orders — isValidTransition (pure)', () => {
  const { isValidTransition } = jest.requireActual('../src/models/orderModel');
  test('pending → in_progress is valid', () => {
    expect(isValidTransition('pending', 'in_progress')).toBe(true);
  });
  test('in_progress → completed is valid', () => {
    expect(isValidTransition('in_progress', 'completed')).toBe(true);
  });
  test('pending → completed is invalid (must go through in_progress)', () => {
    expect(isValidTransition('pending', 'completed')).toBe(false);
  });
  test('completed → anything is invalid', () => {
    expect(isValidTransition('completed', 'pending')).toBe(false);
    expect(isValidTransition('completed', 'in_progress')).toBe(false);
  });
});
