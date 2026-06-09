'use strict';

const pool = require('../db/pool');

// Joined SELECT — pulls group_name + category_name from the linked masters
// so the frontend table can show both without N+1 lookups.
const SELECT_WITH_LINKS = `
  SELECT im.id, im.name, im.hsn_code, im.gst_rate, im.batch, im.unit,
         im.opening_qty, im.opening_rate, im.opening_value,
         im.item_group_id, ig.group_name AS item_group_name,
         im.item_category_id, ic.category_name AS item_category_name,
         im.tally_master_id, im.created_at, im.updated_at
    FROM item_master im
    LEFT JOIN item_group ig    ON ig.id = im.item_group_id
    LEFT JOIN item_category ic ON ic.id = im.item_category_id
`;

function normalizeBatch(v) {
  if (v === undefined || v === null || v === '') return 'No';
  const s = String(v).trim().toLowerCase();
  if (s === 'yes' || s === 'y' || s === '1' || s === 'true') return 'Yes';
  return 'No';
}

function toDecimal(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Opening-stock sync — keeps inventory_entries (rollup) + batch (breakdown)
// in lock-step with the item_master row. Opening rows are identified by
// `led_id IS NULL` (no voucher anchors them).
//
// Always runs full replace: delete existing opening rows for this item, then
// re-insert based on the latest payload. Cascade chain on inventory_entries
// → batch handles cleanup.
// ---------------------------------------------------------------------------
async function syncOpeningStock(conn, itemId, opts) {
  const { batchFlag, openingQty, openingRate, openingValue, batches } = opts;

  // Wipe prior opening rows for this item.
  await conn.execute(
    'DELETE FROM inventory_entries WHERE led_id IS NULL AND item_id = :item_id',
    { item_id: itemId }
  );

  const hasBatches = batchFlag === 'Yes' && Array.isArray(batches) && batches.length > 0;

  // Skip if nothing to record.
  if (!hasBatches && openingQty <= 0 && openingValue <= 0) return;

  // Insert the rollup row.
  const [ie] = await conn.execute(
    `INSERT INTO inventory_entries
       (led_id, item_id, qty, rate, amount)
     VALUES
       (NULL, :item_id, :qty, :rate, :amount)`,
    {
      item_id: itemId,
      qty: openingQty,
      rate: openingRate,
      amount: openingValue,
    }
  );
  const inventoryId = ie.insertId;

  // Per-batch breakdown (batch=Yes only).
  if (hasBatches) {
    for (const b of batches) {
      const qty = toDecimal(b.qty);
      const rate = toDecimal(b.rate);
      const amount = round2(qty * rate);
      await conn.execute(
        `INSERT INTO batch
           (vch_id, inventory_id, item_id, batch_no,
            qty, rate, amount, inc_rate, l_rate, e_rate)
         VALUES
           (NULL, :inventory_id, :item_id, :batch_no,
            :qty, :rate, :amount, 0, 0, 0)`,
        {
          inventory_id: inventoryId,
          item_id: itemId,
          batch_no: b.batch_no ? String(b.batch_no).trim() : null,
          qty,
          rate,
          amount,
        }
      );
    }
  }
}

async function findAll() {
  const [rows] = await pool.execute(`${SELECT_WITH_LINKS} ORDER BY im.name ASC`);
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute(
    `${SELECT_WITH_LINKS} WHERE im.id = :id LIMIT 1`,
    { id }
  );
  const row = rows[0] || null;
  if (!row) return null;

  // Pull opening batches (if any) so the form can rehydrate the modal.
  const [batches] = await pool.execute(
    `SELECT b.id, b.batch_no, b.qty, b.rate, b.amount
       FROM batch b
       JOIN inventory_entries ie ON ie.id = b.inventory_id
      WHERE ie.led_id IS NULL AND b.item_id = :item_id
      ORDER BY b.id ASC`,
    { item_id: id }
  );
  return { ...row, batches };
}

async function search(q) {
  const like = `%${q}%`;
  const [rows] = await pool.execute(
    `SELECT id, name, hsn_code, gst_rate
       FROM item_master
      WHERE name LIKE :like OR hsn_code LIKE :like
      ORDER BY name ASC LIMIT 50`,
    { like }
  );
  return rows;
}

async function findByName(name) {
  const [rows] = await pool.execute(
    'SELECT id FROM item_master WHERE LOWER(name) = LOWER(:name) LIMIT 1',
    { name }
  );
  return rows[0] || null;
}

async function create(payload) {
  const {
    name, hsn_code, gst_rate, batch, unit,
    opening_qty, opening_rate, opening_value,
    item_group_id, item_category_id, tally_master_id, userId,
    batches,
  } = payload;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const batchFlag = normalizeBatch(batch);
    const oqty = toDecimal(opening_qty);
    const orate = toDecimal(opening_rate);
    const oval = toDecimal(opening_value);

    const [r] = await conn.execute(
      `INSERT INTO item_master
         (name, hsn_code, gst_rate, batch, unit,
          opening_qty, opening_rate, opening_value,
          item_group_id, item_category_id, tally_master_id, created_by)
       VALUES (:name, :hsn_code, :gst_rate, :batch, :unit,
               :opening_qty, :opening_rate, :opening_value,
               :item_group_id, :item_category_id, :tally_master_id, :userId)`,
      {
        name: String(name).trim(),
        hsn_code: hsn_code ? String(hsn_code).trim().toUpperCase() : null,
        gst_rate: gst_rate == null || gst_rate === '' ? null : Number(gst_rate),
        batch: batchFlag,
        unit: unit ? String(unit).trim() : null,
        opening_qty: oqty,
        opening_rate: orate,
        opening_value: oval,
        item_group_id: item_group_id == null || item_group_id === '' ? null : Number(item_group_id),
        item_category_id: item_category_id == null || item_category_id === '' ? null : Number(item_category_id),
        tally_master_id: tally_master_id || null,
        userId: userId ?? null,
      }
    );
    const itemId = r.insertId;

    await syncOpeningStock(conn, itemId, {
      batchFlag,
      openingQty: oqty,
      openingRate: orate,
      openingValue: oval,
      batches,
    });

    await conn.commit();
    return { id: itemId };
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

async function update(id, payload) {
  const {
    name, hsn_code, gst_rate, batch, unit,
    opening_qty, opening_rate, opening_value,
    item_group_id, item_category_id,
    batches,
  } = payload;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const batchFlag = normalizeBatch(batch);
    const oqty = toDecimal(opening_qty);
    const orate = toDecimal(opening_rate);
    const oval = toDecimal(opening_value);

    await conn.execute(
      `UPDATE item_master
          SET name = :name,
              hsn_code = :hsn_code,
              gst_rate = :gst_rate,
              batch = :batch,
              unit = :unit,
              opening_qty = :opening_qty,
              opening_rate = :opening_rate,
              opening_value = :opening_value,
              item_group_id = :item_group_id,
              item_category_id = :item_category_id
        WHERE id = :id`,
      {
        id,
        name: String(name).trim(),
        hsn_code: hsn_code ? String(hsn_code).trim().toUpperCase() : null,
        gst_rate: gst_rate == null || gst_rate === '' ? null : Number(gst_rate),
        batch: batchFlag,
        unit: unit ? String(unit).trim() : null,
        opening_qty: oqty,
        opening_rate: orate,
        opening_value: oval,
        item_group_id: item_group_id == null || item_group_id === '' ? null : Number(item_group_id),
        item_category_id: item_category_id == null || item_category_id === '' ? null : Number(item_category_id),
      }
    );

    await syncOpeningStock(conn, id, {
      batchFlag,
      openingQty: oqty,
      openingRate: orate,
      openingValue: oval,
      batches,
    });

    await conn.commit();
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { findAll, findById, findByName, search, create, update };
