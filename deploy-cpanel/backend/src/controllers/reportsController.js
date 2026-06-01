'use strict';

/**
 * Reports controller. Per-stat permission gating happens INSIDE the handler
 * so a user with partial visibility sees zero for stats they can't view
 * (instead of a 403 for the whole summary).
 *
 * The Reports page itself was retired; only `/summary` remains, used by the
 * Dashboard tiles + ProfilePanel summary.
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

async function countBilties() {
  const vchTypeId = await biltyModel.getBiltyTypeId();
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS c FROM vch_details WHERE vch_type_id = ?',
    [vchTypeId]
  );
  return Number(rows[0]?.c ?? 0);
}

// GET /api/reports/summary
exports.getSummary = async (req, res, next) => {
  try {
    const user = req.user;
    // Each tile is gated on the matching page's `.view` perm. Daybook took
    // the slot that `report.view` used to occupy; active_users is now gated
    // on `user.view` (it's surfaced as an admin tile alongside the others).
    const canBilty = hasPerm(user, 'bilty.view');
    const canDaybook = hasPerm(user, 'daybook.view');
    const canFreight = hasPerm(user, 'freight.view') || canBilty;
    const canLedgerGroup = hasPerm(user, 'ledgergroup.view');
    const canUsers = hasPerm(user, 'user.view');

    return res.status(200).json({
      bilties: canBilty ? await countBilties() : 0,
      freight_memos: canFreight ? await countTable('freight_memo') : 0,
      ledger_groups: canLedgerGroup ? await countTable('ledger_group') : 0,
      active_users: canUsers ? await countActiveUsers() : 0,
      permissions: {
        bilty: canBilty,
        freight: canFreight,
        daybook: canDaybook,
        ledgergroup: canLedgerGroup,
        user: canUsers,
      },
    });
  } catch (err) {
    return next(err);
  }
};

// Exported for tests
exports._internals = { hasPerm, normalizePerms };
exports._models = { biltyModel, userModel };
