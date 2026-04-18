'use strict';

const freightModel = require('../models/freightModel');
const { transact } = require('../db/transact');
const pool = require('../db/pool');

/**
 * Generate a freight memo from a bilty.
 * Uses Snapshot + Recompute Hybrid:
 *   - Stores computed totals at generation time (snapshot).
 *   - Sets is_stale = 0 on generation / regeneration.
 *   - Callers should check is_stale before displaying totals as current.
 */
async function generateMemo({ biltyId, userId, ip }) {
  return transact(pool, async (conn, audit) => {
    const memo = await freightModel.generateFromBilty(biltyId, userId, conn);
    await audit({
      action: 'GENERATE',
      entityType: 'freight_memo',
      entityId: memo.id,
      userId,
      before: null,
      after: { bilty_id: biltyId, memo_no: memo.memo_no },
      ip,
    });
    return memo;
  });
}

/**
 * Regenerate (recompute) an existing memo from the latest bilty data.
 * Resets is_stale = 0 and bumps version.
 * @throws {{ code: 'version_conflict' }} on OCC mismatch
 */
async function regenerateMemo({ memoId, version, userId, ip }) {
  return transact(pool, async (conn, audit) => {
    const [rows] = await conn.execute(
      'SELECT * FROM freight_memo WHERE id = ? FOR UPDATE',
      [memoId]
    );
    if (!rows.length) {
      const err = new Error('memo_not_found');
      err.code = 'memo_not_found';
      throw err;
    }
    const current = rows[0];
    if (current.version !== version) {
      const err = new Error('version_conflict');
      err.code = 'version_conflict';
      throw err;
    }

    const updated = await freightModel.recomputeFromBilty(memoId, current.bilty_id, conn);

    await audit({
      action: 'UPDATE',
      entityType: 'freight_memo',
      entityId: memoId,
      userId,
      before: current,
      after: { ...updated, version: current.version + 1 },
      ip,
    });

    return updated;
  });
}

module.exports = { generateMemo, regenerateMemo };
