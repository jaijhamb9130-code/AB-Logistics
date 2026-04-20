'use strict';

/**
 * Phase 3 — Bilty model.
 *
 * Responsibilities:
 *  - createWithChildren: wraps header + items + advances + fuels in a single
 *    transaction. Auto-generates bilty_no = 'BL-YYYY-NNNNNN' using the next
 *    per-year sequence from the existing bilty rows.
 *  - findAll: list with a cheap summary (item_count computed via subquery).
 *  - findById: header + nested items + advances + fuels (3 child selects).
 *
 * Numeric columns are DECIMAL(12,2) in the schema; mysql2 returns them as
 * strings. We DO NOT coerce here — the controller / client format on render.
 */

const pool = require('../db/pool');

// ---- bilty_no generator ---------------------------------------------------
// Format: BL-YYYY-NNNNNN  (year + 6-digit sequence, per-year).
// Runs INSIDE the transaction so two racing creates get distinct numbers.
async function nextBiltyNo(conn, year) {
  const prefix = `BL-${year}-`;
  const [rows] = await conn.execute(
    'SELECT bilty_no FROM bilty WHERE bilty_no LIKE :p ORDER BY id DESC LIMIT 1 FOR UPDATE',
    { p: `${prefix}%` }
  );
  let seq = 1;
  if (rows.length > 0) {
    const tail = String(rows[0].bilty_no).slice(prefix.length);
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

function toDateOrNull(v) {
  if (!v) return null;
  // Accept 'YYYY-MM-DD' or ISO strings. MySQL DATE is happy with the first.
  return String(v).slice(0, 10);
}

async function createWithChildren({ header, items, advances, fuels, userId }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const year = new Date().getUTCFullYear();
    const bilty_no = await nextBiltyNo(conn, year);

    const [h] = await conn.execute(
      `INSERT INTO bilty
         (bilty_no, bilty_date, consignor, owner_name, agent_name, branch,
          zone_name, truck_no, goods_type, truck_type, created_by)
       VALUES
         (:bilty_no, :bilty_date, :consignor, :owner_name, :agent_name, :branch,
          :zone_name, :truck_no, :goods_type, :truck_type, :created_by)`,
      {
        bilty_no,
        bilty_date: toDateOrNull(header.bilty_date),
        consignor: header.consignor,
        owner_name: header.owner_name ?? null,
        agent_name: header.agent_name ?? null,
        branch: header.branch ?? null,
        zone_name: header.zone_name ?? null,
        truck_no: header.truck_no,
        goods_type: header.goods_type ?? null,
        truck_type: header.truck_type ?? null,
        created_by: userId ?? null,
      }
    );
    const biltyId = h.insertId;

    for (const it of items || []) {
      await conn.execute(
        `INSERT INTO bilty_items
           (bilty_id, challan_no, lr_no, from_loc, to_loc, consignee,
            qty, rate, inc_rate, l_rate, e_rate)
         VALUES
           (:bilty_id, :challan_no, :lr_no, :from_loc, :to_loc, :consignee,
            :qty, :rate, :inc_rate, :l_rate, :e_rate)`,
        {
          bilty_id: biltyId,
          challan_no: it.challan_no ?? null,
          lr_no: it.lr_no ?? null,
          from_loc: it.from_loc ?? null,
          to_loc: it.to_loc ?? null,
          consignee: it.consignee ?? null,
          qty: toNum(it.qty),
          rate: toNum(it.rate),
          inc_rate: toNum(it.inc_rate),
          l_rate: toNum(it.l_rate),
          e_rate: toNum(it.e_rate),
        }
      );
    }

    for (const a of advances || []) {
      await conn.execute(
        `INSERT INTO advance_details
           (bilty_id, adv_date, adv_from, amount, narration)
         VALUES (:bilty_id, :adv_date, :adv_from, :amount, :narration)`,
        {
          bilty_id: biltyId,
          adv_date: toDateOrNull(a.adv_date),
          adv_from: a.adv_from ?? null,
          amount: toNum(a.amount),
          narration: a.narration ?? null,
        }
      );
    }

    for (const f of fuels || []) {
      await conn.execute(
        `INSERT INTO fuel_details
           (bilty_id, from_loc, amount, doc_no, doc_date)
         VALUES (:bilty_id, :from_loc, :amount, :doc_no, :doc_date)`,
        {
          bilty_id: biltyId,
          from_loc: f.from_loc ?? null,
          amount: toNum(f.amount),
          doc_no: f.doc_no ?? null,
          doc_date: toDateOrNull(f.doc_date),
        }
      );
    }

    await conn.commit();
    return { id: biltyId, bilty_no };
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

async function findAll() {
  const [rows] = await pool.execute(
    `SELECT b.id, b.bilty_no, b.bilty_date, b.consignor, b.truck_no,
            b.created_at,
            (SELECT COUNT(*) FROM bilty_items bi WHERE bi.bilty_id = b.id) AS item_count
       FROM bilty b
       ORDER BY b.id DESC`
  );
  return rows;
}

async function findById(id) {
  const [hdrs] = await pool.execute(
    `SELECT id, bilty_no, bilty_date, consignor, owner_name, agent_name,
            branch, zone_name, truck_no, goods_type, truck_type,
            created_by, created_at, updated_at
       FROM bilty WHERE id = :id LIMIT 1`,
    { id }
  );
  const header = hdrs[0];
  if (!header) return null;

  const [items] = await pool.execute(
    `SELECT id, bilty_id, challan_no, lr_no, from_loc, to_loc, consignee,
            qty, rate, inc_rate, l_rate, e_rate
       FROM bilty_items WHERE bilty_id = :id ORDER BY id ASC`,
    { id }
  );
  const [advances] = await pool.execute(
    `SELECT id, bilty_id, adv_date, adv_from, amount, narration
       FROM advance_details WHERE bilty_id = :id ORDER BY id ASC`,
    { id }
  );
  const [fuels] = await pool.execute(
    `SELECT id, bilty_id, from_loc, amount, doc_no, doc_date
       FROM fuel_details WHERE bilty_id = :id ORDER BY id ASC`,
    { id }
  );

  return { ...header, items, advances, fuels };
}

// Full replace: UPDATE header + DELETE+INSERT all children. bilty_no never changes.
async function updateWithChildren(id, { header, items, advances, fuels }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [chk] = await conn.execute(
      'SELECT id FROM bilty WHERE id = :id LIMIT 1 FOR UPDATE',
      { id }
    );
    if (chk.length === 0) {
      await conn.rollback();
      return false;
    }

    await conn.execute(
      `UPDATE bilty SET
         bilty_date = :bilty_date,
         consignor = :consignor,
         owner_name = :owner_name,
         agent_name = :agent_name,
         branch = :branch,
         zone_name = :zone_name,
         truck_no = :truck_no,
         goods_type = :goods_type,
         truck_type = :truck_type
       WHERE id = :id`,
      {
        id,
        bilty_date: toDateOrNull(header.bilty_date),
        consignor: header.consignor,
        owner_name: header.owner_name ?? null,
        agent_name: header.agent_name ?? null,
        branch: header.branch ?? null,
        zone_name: header.zone_name ?? null,
        truck_no: header.truck_no,
        goods_type: header.goods_type ?? null,
        truck_type: header.truck_type ?? null,
      }
    );

    await conn.execute('DELETE FROM bilty_items WHERE bilty_id = :id', { id });
    await conn.execute('DELETE FROM advance_details WHERE bilty_id = :id', { id });
    await conn.execute('DELETE FROM fuel_details WHERE bilty_id = :id', { id });

    for (const it of items || []) {
      await conn.execute(
        `INSERT INTO bilty_items
           (bilty_id, challan_no, lr_no, from_loc, to_loc, consignee,
            qty, rate, inc_rate, l_rate, e_rate)
         VALUES
           (:bilty_id, :challan_no, :lr_no, :from_loc, :to_loc, :consignee,
            :qty, :rate, :inc_rate, :l_rate, :e_rate)`,
        {
          bilty_id: id,
          challan_no: it.challan_no ?? null,
          lr_no: it.lr_no ?? null,
          from_loc: it.from_loc ?? null,
          to_loc: it.to_loc ?? null,
          consignee: it.consignee ?? null,
          qty: toNum(it.qty),
          rate: toNum(it.rate),
          inc_rate: toNum(it.inc_rate),
          l_rate: toNum(it.l_rate),
          e_rate: toNum(it.e_rate),
        }
      );
    }

    for (const a of advances || []) {
      await conn.execute(
        `INSERT INTO advance_details
           (bilty_id, adv_date, adv_from, amount, narration)
         VALUES (:bilty_id, :adv_date, :adv_from, :amount, :narration)`,
        {
          bilty_id: id,
          adv_date: toDateOrNull(a.adv_date),
          adv_from: a.adv_from ?? null,
          amount: toNum(a.amount),
          narration: a.narration ?? null,
        }
      );
    }

    for (const f of fuels || []) {
      await conn.execute(
        `INSERT INTO fuel_details
           (bilty_id, from_loc, amount, doc_no, doc_date)
         VALUES (:bilty_id, :from_loc, :amount, :doc_no, :doc_date)`,
        {
          bilty_id: id,
          from_loc: f.from_loc ?? null,
          amount: toNum(f.amount),
          doc_no: f.doc_no ?? null,
          doc_date: toDateOrNull(f.doc_date),
        }
      );
    }

    await conn.commit();
    return true;
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = {
  createWithChildren,
  updateWithChildren,
  findAll,
  findById,
};
