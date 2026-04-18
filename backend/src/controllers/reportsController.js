'use strict';

/**
 * Phase 6 — Reports controller (REPORT-01..03).
 *
 * Endpoints:
 *   GET /api/reports/summary  → totals (bilties, freight_memos, orders, vehicles, active_users)
 *   GET /api/reports/history  → recent bilties + orders (last 20 each)
 *
 * Permission gating happens INSIDE the handlers (not via requirePermission
 * middleware) because a user may have partial visibility — e.g. staff with
 * only `bilty.read` should see bilty stats / bilty history and zero/empty
 * for the rest, NOT a 403 for the whole endpoint.
 */

const pool = require('../db/pool');
const biltyModel = require('../models/biltyModel');
const orderModel = require('../models/orderModel');
const vehicleModel = require('../models/vehicleModel');
const userModel = require('../models/userModel');

function normalizePerms(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function hasPerm(user, perm) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const perms = normalizePerms(user.permissions);
  return perms.includes('*') || perms.includes(perm);
}

async function countTable(table) {
  const [rows] = await pool.execute(`SELECT COUNT(*) AS c FROM ${table}`);
  return Number(rows[0]?.c ?? 0);
}

async function countActiveUsers() {
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS c FROM users WHERE is_active = 1'
  );
  return Number(rows[0]?.c ?? 0);
}

// GET /api/reports/summary
exports.getSummary = async (req, res, next) => {
  try {
    const user = req.user;

    const canBilty = hasPerm(user, 'bilty.read');
    const canOrder = hasPerm(user, 'order.read');
    const canVehicle = hasPerm(user, 'vehicle.read');
    const canReport = hasPerm(user, 'report.read');
    // freight visibility tracks bilty per Phase 4 convention
    const canFreight = hasPerm(user, 'freight.read') || canBilty;

    const payload = {
      bilties: canBilty ? await countTable('bilty') : 0,
      freight_memos: canFreight ? await countTable('freight_memo') : 0,
      orders: canOrder ? await countTable('orders') : 0,
      vehicles: canVehicle ? await countTable('vehicles') : 0,
      // active_users is admin-only metadata — gated by report.read (admin passes via hasPerm)
      active_users: canReport ? await countActiveUsers() : 0,
      permissions: {
        bilty: canBilty,
        freight: canFreight,
        order: canOrder,
        vehicle: canVehicle,
        report: canReport,
      },
    };

    return res.status(200).json(payload);
  } catch (err) {
    return next(err);
  }
};

// GET /api/reports/history
exports.getHistory = async (req, res, next) => {
  try {
    const user = req.user;
    const canBilty = hasPerm(user, 'bilty.read');
    const canOrder = hasPerm(user, 'order.read');

    const [bilties, orders] = await Promise.all([
      canBilty ? biltyModel.findAll() : Promise.resolve([]),
      canOrder ? orderModel.findAll() : Promise.resolve([]),
    ]);

    return res.status(200).json({
      bilties: bilties.slice(0, 20),
      orders: orders.slice(0, 20),
      permissions: {
        bilty: canBilty,
        order: canOrder,
      },
    });
  } catch (err) {
    return next(err);
  }
};

// Exported for tests
exports._internals = { hasPerm, normalizePerms };

// unused-but-convenient: referenced models so tests can assert mocking
exports._models = { biltyModel, orderModel, vehicleModel, userModel };
