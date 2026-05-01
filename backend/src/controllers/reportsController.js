'use strict';

/**
 * Reports controller. Permission gating happens INSIDE the handlers so a
 * user with partial visibility sees zero/empty for stats they can't view
 * (instead of a 403 for the whole endpoint).
 */

const pool = require('../db/pool');
const biltyModel = require('../models/biltyModel');
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
    const canBilty = hasPerm(user, 'bilty.edit');
    const canReport = hasPerm(user, 'report.access');
    // Freight visibility tracks bilty (Phase 4 convention).
    const canFreight = hasPerm(user, 'freight.access') || canBilty;

    const canLedgerGroup = hasPerm(user, 'ledgergroup.edit');
    return res.status(200).json({
      bilties: canBilty ? await countTable('bilty') : 0,
      freight_memos: canFreight ? await countTable('freight_memo') : 0,
      ledger_groups: canLedgerGroup ? await countTable('ledger_group') : 0,
      active_users: canReport ? await countActiveUsers() : 0,
      permissions: {
        bilty: canBilty,
        freight: canFreight,
        report: canReport,
        ledgergroup: canLedgerGroup,
      },
    });
  } catch (err) {
    return next(err);
  }
};

// GET /api/reports/history
exports.getHistory = async (req, res, next) => {
  try {
    const user = req.user;
    const canBilty = hasPerm(user, 'bilty.edit');

    const bilties = canBilty ? await biltyModel.findAll() : [];

    return res.status(200).json({
      bilties: bilties.slice(0, 20),
      permissions: { bilty: canBilty },
    });
  } catch (err) {
    return next(err);
  }
};

// Exported for tests
exports._internals = { hasPerm, normalizePerms };
exports._models = { biltyModel, userModel };
