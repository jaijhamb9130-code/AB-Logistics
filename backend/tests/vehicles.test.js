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

jest.mock('../src/models/vehicleModel', () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  findByVehicleNo: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  setActive: jest.fn(),
}));

jest.mock('../src/db/pool', () => ({
  execute: jest.fn(),
  getConnection: jest.fn(),
  end: jest.fn(),
}));

const request = require('supertest');
const userModel = require('../src/models/userModel');
const vehicleModel = require('../src/models/vehicleModel');
const { signAccessToken } = require('../src/utils/jwt');

let app;
beforeAll(() => { app = require('../src/app'); });
beforeEach(() => {
  Object.values(userModel).forEach((fn) => fn.mockReset && fn.mockReset());
  Object.values(vehicleModel).forEach((fn) => fn.mockReset && fn.mockReset());
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

function staffNoVehicleEditAuth() {
  const row = userRow({ id: 2, role: 'staff', permissions: ['vehicle.read'] });
  userModel.findById.mockResolvedValueOnce(row);
  return signAccessToken({ id: row.id, role: row.role });
}

const VEHICLE_ROW = {
  id: 7,
  vehicle_no: 'DL-01-AB-1234',
  vehicle_type: '10-wheeler',
  owner_name: 'John',
  is_active: 1,
  created_at: '2026-04-18T00:00:00.000Z',
  updated_at: '2026-04-18T00:00:00.000Z',
};

describe('vehicles — POST /api/vehicles (create)', () => {
  test('201 creates vehicle and returns sanitized row', async () => {
    const token = adminAuth();
    vehicleModel.findByVehicleNo.mockResolvedValueOnce(null);
    vehicleModel.create.mockResolvedValueOnce(7);
    vehicleModel.findById.mockResolvedValueOnce(VEHICLE_ROW);

    const res = await request(app)
      .post('/api/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicle_no: 'DL-01-AB-1234', vehicle_type: '10-wheeler', owner_name: 'John' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(expect.objectContaining({
      id: 7, vehicle_no: 'DL-01-AB-1234', is_active: true,
    }));
    expect(vehicleModel.create).toHaveBeenCalledTimes(1);
  });

  test('400 invalid_vehicle_no when missing', async () => {
    const token = adminAuth();
    const res = await request(app)
      .post('/api/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicle_no: '' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_vehicle_no' });
    expect(vehicleModel.create).not.toHaveBeenCalled();
  });

  test('403 forbidden for staff without vehicle.edit', async () => {
    const token = staffNoVehicleEditAuth();
    const res = await request(app)
      .post('/api/vehicles')
      .set('Authorization', `Bearer ${token}`)
      .send({ vehicle_no: 'DL-01-AB-1234' });
    expect(res.status).toBe(403);
    expect(vehicleModel.create).not.toHaveBeenCalled();
  });
});

describe('vehicles — GET endpoints', () => {
  test('GET /api/vehicles 200 returns array', async () => {
    const token = adminAuth();
    vehicleModel.findAll.mockResolvedValueOnce([VEHICLE_ROW]);
    const res = await request(app)
      .get('/api/vehicles')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].vehicle_no).toBe('DL-01-AB-1234');
    expect(res.body[0].is_active).toBe(true);
  });

  test('GET /api/vehicles/:id 200 returns single row', async () => {
    const token = adminAuth();
    vehicleModel.findById.mockResolvedValueOnce(VEHICLE_ROW);
    const res = await request(app)
      .get('/api/vehicles/7')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(7);
  });

  test('GET /api/vehicles/:id 404 when missing', async () => {
    const token = adminAuth();
    vehicleModel.findById.mockResolvedValueOnce(null);
    const res = await request(app)
      .get('/api/vehicles/999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'vehicle_not_found' });
  });
});

describe('vehicles — PATCH /api/vehicles/:id (update)', () => {
  test('200 updates owner_name', async () => {
    const token = adminAuth();
    vehicleModel.update.mockResolvedValueOnce(true);
    vehicleModel.findById.mockResolvedValueOnce({ ...VEHICLE_ROW, owner_name: 'Jane' });
    const res = await request(app)
      .patch('/api/vehicles/7')
      .set('Authorization', `Bearer ${token}`)
      .send({ owner_name: 'Jane' });
    expect(res.status).toBe(200);
    expect(res.body.owner_name).toBe('Jane');
  });
});

describe('vehicles — POST /api/vehicles/:id/deactivate', () => {
  test('200 flips is_active to false', async () => {
    const token = adminAuth();
    vehicleModel.setActive.mockResolvedValueOnce(true);
    vehicleModel.findById.mockResolvedValueOnce({ ...VEHICLE_ROW, is_active: 0 });
    const res = await request(app)
      .post('/api/vehicles/7/deactivate')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(false);
  });
});
