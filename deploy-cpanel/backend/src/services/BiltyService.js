'use strict';

const biltyModel = require('../models/biltyModel');
const { transact } = require('../db/transact');
const pool = require('../db/pool');

/**
 * Create a new bilty with full OCC + audit trail.
 *
 * Bilty headers live in `vch_details` (vch_type_id = Bilty system row).
 * The model handles ledger-id resolution and child inserts.
 */
async function createBilty({ header, items, userId, ip }) {
  return transact(pool, async (conn, audit) => {
    const { id, bilty_no } = await biltyModel.createWithChildren(
      { header, items, userId },
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
 * Patch a bilty header. Last-write-wins; OCC removed by user request.
 * @throws {{ code: 'bilty_not_found' }}
 */
async function updateBilty({ id, patch, userId, ip }) {
  return transact(pool, async (conn, audit) => {
    const vchTypeId = await biltyModel.getBiltyTypeId(conn);

    const [rows] = await conn.execute(
      'SELECT * FROM vch_details WHERE id = ? AND vch_type_id = ? FOR UPDATE',
      [id, vchTypeId]
    );
    if (!rows.length) {
      const err = new Error('bilty_not_found');
      err.code = 'bilty_not_found';
      throw err;
    }
    const current = rows[0];

    const fields = Object.keys(patch)
      .map((k) => `${k} = ?`)
      .join(', ');
    await conn.execute(
      `UPDATE vch_details SET ${fields}
        WHERE id = ? AND vch_type_id = ?`,
      [...Object.values(patch), id, vchTypeId]
    );

    await audit({
      action: 'UPDATE',
      entityType: 'bilty',
      entityId: id,
      userId,
      before: current,
      after: { ...current, ...patch },
      ip,
    });

    return { id };
  });
}

module.exports = { createBilty, updateBilty };
