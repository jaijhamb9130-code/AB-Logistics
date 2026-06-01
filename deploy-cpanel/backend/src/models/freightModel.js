'use strict';

/**
 * Phase 4 — Freight Memo model.
 *
 * Responsibilities:
 *  - generateFromBilty(biltyId, userId): one-shot, transactional. Loads the
 *    bilty with children, computes totals, auto-generates memo_no, and inserts
 *    a single freight_memo row. One memo per bilty — UNIQUE(bilty_id) at the
 *    DB level. Throws typed errors: 'bilty_not_found' | 'memo_exists'.
 *  - findAll: list summary (no children — bilty join gives bilty_no).
 *  - findById: returns the memo row + the denormalized bilty snapshot (header
 *    + items) by delegating to biltyModel.findById. The snapshot is LIVE —
 *    re-computed from bilty every load.
 *  - findByBiltyId: idempotency / navigation helper.
 *
 * CLAUDE.md rule honored: freight_memo NEVER duplicates item rows — totals
 * only. `bilty` is the source of truth.
 *
 * Numeric columns are DECIMAL(12,2); mysql2 returns them as strings. We DO
 * NOT coerce here — the controller / client format on render.
 */

const pool = require('../db/pool');
const biltyModel = require('./biltyModel');

// ---- memo_no generator ----------------------------------------------------
// Format: FM-YYYY-NNNNNN  (year + 6-digit sequence, per-year).
// Runs INSIDE the transaction so two racing generates get distinct numbers.
async function nextMemoNo(conn, year) {
  const prefix = `FM-${year}-`;
  const [rows] = await conn.execute(
    'SELECT memo_no FROM freight_memo WHERE memo_no LIKE :p ORDER BY id DESC LIMIT 1 FOR UPDATE',
    { p: `${prefix}%` }
  );
  let seq = 1;
  if (rows.length > 0) {
    const tail = String(rows[0].memo_no).slice(prefix.length);
    const n = Number(tail);
    if (Number.isInteger(n) && n > 0) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(6, '0')}`;
}

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Pure totals math — exported for direct unit tests, reused by both
 * generateFromBilty() and findById() so the displayed numbers always match
 * what was stored at generation time (modulo bilty edits).
 *
 * freight_total = SUM(qty × rate) across items
 * net_payable   = freight_total
 */
function computeTotals({ items = [] }) {
  const freight_total = round2(
    items.reduce((s, it) => s + toNum(it.qty) * toNum(it.rate), 0)
  );
  const net_payable = freight_total;
  return { freight_total, net_payable };
}

async function generateFromBilty(biltyId, userId) {
  const bilty = await biltyModel.findById(biltyId);
  if (!bilty) {
    const err = new Error('bilty_not_found');
    err.code = 'bilty_not_found';
    throw err;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Idempotent guard under transaction: if a memo already exists for this
    // bilty (vch_id), fail fast before INSERTs hit the UNIQUE.
    const [existing] = await conn.execute(
      'SELECT id FROM freight_memo WHERE vch_id = :id LIMIT 1 FOR UPDATE',
      { id: biltyId }
    );
    if (existing.length > 0) {
      const err = new Error('memo_exists');
      err.code = 'memo_exists';
      throw err;
    }

    const totals = computeTotals({ items: bilty.items });

    const year = new Date().getUTCFullYear();
    const memo_no = await nextMemoNo(conn, year);
    const memo_date = new Date().toISOString().slice(0, 10);

    const [r] = await conn.execute(
      `INSERT INTO freight_memo
         (memo_no, vch_id, memo_date, freight_total, net_payable, generated_by)
       VALUES
         (:memo_no, :vch_id, :memo_date, :freight_total, :net_payable, :generated_by)`,
      {
        memo_no,
        vch_id: biltyId,
        memo_date,
        freight_total: totals.freight_total,
        net_payable: totals.net_payable,
        generated_by: userId ?? null,
      }
    );

    await conn.commit();
    return {
      id: r.insertId,
      memo_no,
      bilty_id: biltyId,
      memo_date,
      ...totals,
    };
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

async function findAll() {
  // bilty headers now live in vch_details (vch_type_id = Bilty); join via
  // ledger_master to recover the consignor name.
  const [rows] = await pool.execute(
    `SELECT fm.id, fm.memo_no,
            fm.vch_id AS bilty_id,
            fm.memo_date,
            fm.freight_total, fm.net_payable,
            fm.generated_by, fm.created_at,
            v.vch_no AS bilty_no,
            cons.name AS consignor,
            veh.name  AS truck_no
       FROM freight_memo fm
       JOIN vch_details v           ON v.id    = fm.vch_id
       LEFT JOIN ledger_master cons ON cons.id = v.ledger_master_id
       LEFT JOIN ledger_master veh  ON veh.id  = v.vehicle_id
       ORDER BY fm.id DESC`
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT id, memo_no,
            vch_id AS bilty_id,
            memo_date, freight_total, net_payable,
            generated_by, created_at, updated_at
       FROM freight_memo WHERE id = :id LIMIT 1`,
    { id }
  );
  const memo = rows[0];
  if (!memo) return null;

  const bilty = await biltyModel.findById(memo.bilty_id);
  // Bilty may have been deleted (ON DELETE CASCADE should have wiped the memo
  // too, but defend anyway). If gone, return the frozen memo with a null snapshot.
  return { ...memo, bilty };
}

async function findByBiltyId(biltyId) {
  const [rows] = await pool.execute(
    `SELECT id, memo_no,
            vch_id AS bilty_id,
            memo_date, freight_total, net_payable,
            generated_by, created_at, updated_at
       FROM freight_memo WHERE vch_id = :id LIMIT 1`,
    { id: biltyId }
  );
  return rows[0] || null;
}

module.exports = {
  generateFromBilty,
  findAll,
  findById,
  findByBiltyId,
  computeTotals,
};
