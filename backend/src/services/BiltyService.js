'use strict';

const biltyModel = require('../models/biltyModel');
const { transact } = require('../db/transact');
const pool = require('../db/pool');

/**
 * Create a new bilty with full OCC and audit trail.
 */
async function createBilty({ header, items, advances, fuels, userId, ip }) {
  return transact(pool, async (conn, audit) => {
    const { id, bilty_no } = await biltyModel.createWithChildren(
      { header, items, advances, fuels, userId },
      conn
    );
    await audit({
      action: 'CREATE',
      entityType: 'bilty',
      entityId: id,
      userId,
      before: null,
      after: { bilty_no, ...header },
      ip,
    });
    return { id, bilty_no };
  });
}

/**
 * Update bilty header using OCC — rejects if version doesn't match.
 * @throws {{ code: 'version_conflict' }} if another write beat this one
 */
async function updateBilty({ id, version, patch, userId, ip }) {
  return transact(pool, async (conn, audit) => {
    const [rows] = await conn.execute(
      'SELECT * FROM bilty WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!rows.length) {
      const err = new Error('bilty_not_found');
      err.code = 'bilty_not_found';
      throw err;
    }
    const current = rows[0];
    if (current.version !== version) {
      const err = new Error('version_conflict');
      err.code = 'version_conflict';
      throw err;
    }

    const fields = Object.keys(patch)
      .map((k) => `${k} = ?`)
      .join(', ');
    await conn.execute(
      `UPDATE bilty SET ${fields}, version = version + 1 WHERE id = ? AND version = ?`,
      [...Object.values(patch), id, version]
    );

    await audit({
      action: 'UPDATE',
      entityType: 'bilty',
      entityId: id,
      userId,
      before: current,
      after: { ...current, ...patch, version: current.version + 1 },
      ip,
    });

    return { id, version: current.version + 1 };
  });
}

module.exports = { createBilty, updateBilty };
