'use strict';

const pool = require('../db/pool');

// Vehicle Master is the central master for trucks AND their owner details.
// Storage: `vehicle_master` holds one row per OWNER-VERSION of a vehicle number
// (is_current = 1 marks the live owner). The vehicle's ACCOUNTING ledger stays a
// single `ledger_master` row in the "Vehicles" group (one per vehicle number),
// referenced by vehicle_master.ledger_master_id and used for bilty postings.
//
//   "Maintain" → update the current version in place.
//   "Create"   → flip current versions off, insert a NEW current version (e.g.
//                the vehicle changed hands) — history is preserved.
const VEHICLES_GROUP = 'Vehicles';

async function getVehiclesGroupId(conn = pool) {
  const [rows] = await conn.execute(
    'SELECT id FROM ledger_group WHERE group_name = :name LIMIT 1',
    { name: VEHICLES_GROUP }
  );
  if (!rows.length) {
    const e = new Error('vehicles_group_missing');
    e.code = 'vehicles_group_missing';
    throw e;
  }
  return rows[0].id;
}

// `name` is aliased to vehicle_no so existing consumers (e.g. the bilty truck
// dropdown) keep working unchanged.
const SELECT_COLS = `
  SELECT vm.id,
         vm.vehicle_no AS name,
         vm.vehicle_no,
         vm.vehicle_type,
         vm.ledger_group_id,
         lg.group_name AS ledger_group,
         vm.ledger_master_id,
         vm.ledger_master_id AS ledger_id,
         lg.group_name AS owner_name,
         vm.mobile, vm.gst_no, vm.pan_no,
         vm.address, vm.city, vm.state, vm.pincode,
         vm.is_current,
         vm.created_at, vm.updated_at
    FROM vehicle_master vm
    LEFT JOIN ledger_group lg ON lg.id = vm.ledger_group_id
`;

function clean(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

// Resolve a ledger-group NAME (typed in the "Ledger Group" field) to its id.
// Blank → null. Unknown name → null (we don't auto-create groups here).
async function resolveLedgerGroupId(conn, groupName) {
  const name = clean(groupName);
  if (!name) return null;
  const [rows] = await conn.execute(
    'SELECT id FROM ledger_group WHERE group_name = :name LIMIT 1',
    { name }
  );
  return rows.length ? rows[0].id : null;
}

// Find-or-create the vehicle's accounting ledger (ledger_master row, name =
// vehicle number) and FILE IT under the picked ledger group (falling back to
// the system "Vehicles" group when none is chosen). The ledger follows the
// vehicle's group, so the Ledgers screen always matches the vehicle's pick.
// Matched by name regardless of current group, so changing the group MOVES the
// existing ledger instead of creating a duplicate. Bilty Freight Journals credit it.
async function ensureVehicleLedger(conn, vehicleNo, ledgerGroupId) {
  const targetGid = ledgerGroupId || await getVehiclesGroupId(conn);
  const [existing] = await conn.execute(
    'SELECT id, ledger_group_id FROM ledger_master WHERE name = :name ORDER BY id LIMIT 1',
    { name: vehicleNo }
  );
  if (existing.length) {
    if (Number(existing[0].ledger_group_id) !== Number(targetGid)) {
      await conn.execute(
        'UPDATE ledger_master SET ledger_group_id = :gid WHERE id = :id',
        { gid: targetGid, id: existing[0].id }
      );
    }
    return existing[0].id;
  }
  const [r] = await conn.execute(
    'INSERT INTO ledger_master (ledger_group_id, name, billbybill) VALUES (:gid, :name, :bbb)',
    { gid: targetGid, name: vehicleNo, bbb: 'No' }
  );
  return r.insertId;
}

// Column list shared by INSERT (create + version-create).
function ownerCols(body) {
  return {
    vehicle_type: clean(body.vehicle_type),
    mobile: clean(body.mobile),
    gst_no: body.gst_no ? String(body.gst_no).trim().toUpperCase() : null,
    pan_no: body.pan_no ? String(body.pan_no).trim().toUpperCase() : null,
    address: clean(body.address),
    city: clean(body.city),
    state: clean(body.state),
    pincode: clean(body.pincode),
  };
}

async function findAll() {
  const [rows] = await pool.execute(
    `${SELECT_COLS} WHERE vm.is_current = 1 ORDER BY vm.vehicle_no ASC`
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute(`${SELECT_COLS} WHERE vm.id = :id LIMIT 1`, { id });
  return rows[0] || null;
}

async function search(q) {
  const like = `%${q}%`;
  const [rows] = await pool.execute(
    `${SELECT_COLS}
      WHERE vm.is_current = 1 AND (vm.vehicle_no LIKE :like OR lg.group_name LIKE :like)
      ORDER BY vm.vehicle_no ASC LIMIT 50`,
    { like }
  );
  return rows;
}

// Current version for a vehicle number (used for uniqueness + current-owner).
async function findByName(name) {
  const [rows] = await pool.execute(
    `${SELECT_COLS} WHERE vm.vehicle_no = :name AND vm.is_current = 1 LIMIT 1`,
    { name }
  );
  return rows[0] || null;
}

// Current owner name for a vehicle number — used by the bilty form to snapshot
// the owner when a truck is picked.
async function currentOwner(vehicleNo) {
  const [rows] = await pool.execute(
    `SELECT lg.group_name AS owner_name
       FROM vehicle_master vm
       LEFT JOIN ledger_group lg ON lg.id = vm.ledger_group_id
      WHERE vm.vehicle_no = :no AND vm.is_current = 1 LIMIT 1`,
    { no: String(vehicleNo).trim().toUpperCase() }
  );
  return rows.length ? rows[0].owner_name : null;
}

async function create(body) {
  const cleanName = String(body.name ?? body.vehicle_no).trim().toUpperCase();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const ledgerGroupId = await resolveLedgerGroupId(conn, body.ledger_group);
    const ledgerMasterId = await ensureVehicleLedger(conn, cleanName, ledgerGroupId);
    const c = ownerCols(body);
    // A brand-new vehicle number shouldn't already have versions, but guard
    // anyway so the new row is unambiguously the current one.
    await conn.execute('UPDATE vehicle_master SET is_current = 0 WHERE vehicle_no = :no', { no: cleanName });
    const [r] = await conn.execute(
      `INSERT INTO vehicle_master
         (vehicle_no, vehicle_type, ledger_group_id, ledger_master_id,
          mobile, gst_no, pan_no, address, city, state, pincode,
          is_current, created_by)
       VALUES
         (:vehicle_no, :vehicle_type, :ledger_group_id, :ledger_master_id,
          :mobile, :gst_no, :pan_no, :address, :city, :state, :pincode,
          1, :userId)`,
      {
        vehicle_no: cleanName,
        ledger_group_id: ledgerGroupId,
        ledger_master_id: ledgerMasterId,
        ...c,
        userId: body.userId ?? null,
      }
    );
    await conn.commit();
    return { id: r.insertId };
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

// mode = 'maintain' (default): edit the current version in place.
// mode = 'create': retire current versions and add a NEW current version for
//                  the same vehicle number (owner changed). History kept.
async function update(id, body, mode = 'maintain') {
  const cleanName = String(body.name ?? body.vehicle_no).trim().toUpperCase();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const ledgerGroupId = await resolveLedgerGroupId(conn, body.ledger_group);
    const c = ownerCols(body);

    // Reuse/create the accounting ledger and file it under the picked group
    // (it follows the vehicle's group so the Ledgers screen always matches).
    const ledgerMasterId = await ensureVehicleLedger(conn, cleanName, ledgerGroupId);

    if (mode === 'create') {
      await conn.execute('UPDATE vehicle_master SET is_current = 0 WHERE vehicle_no = :no', { no: cleanName });
      await conn.execute(
        `INSERT INTO vehicle_master
           (vehicle_no, vehicle_type, ledger_group_id, ledger_master_id,
            mobile, gst_no, pan_no, address, city, state, pincode,
            is_current, created_by)
         VALUES
           (:vehicle_no, :vehicle_type, :ledger_group_id, :ledger_master_id,
            :mobile, :gst_no, :pan_no, :address, :city, :state, :pincode,
            1, :userId)`,
        {
          vehicle_no: cleanName,
          ledger_group_id: ledgerGroupId,
          ledger_master_id: ledgerMasterId,
          ...c,
          userId: body.userId ?? null,
        }
      );
    } else {
      await conn.execute(
        `UPDATE vehicle_master SET
           vehicle_no = :vehicle_no, vehicle_type = :vehicle_type,
           ledger_group_id = :ledger_group_id, ledger_master_id = :ledger_master_id,
           mobile = :mobile, gst_no = :gst_no, pan_no = :pan_no,
           address = :address, city = :city, state = :state, pincode = :pincode
         WHERE id = :id`,
        {
          id,
          vehicle_no: cleanName,
          ledger_group_id: ledgerGroupId,
          ledger_master_id: ledgerMasterId,
          ...c,
        }
      );
    }
    await conn.commit();
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

// Delete every owner-version of the vehicle this id belongs to, then best-effort
// remove its accounting ledger (kept if a bilty still references it).
async function deleteById(id) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT vehicle_no FROM vehicle_master WHERE id = :id LIMIT 1', { id });
    if (!rows.length) { await conn.rollback(); return { affected: 0 }; }
    const vehicleNo = rows[0].vehicle_no;
    const [r] = await conn.execute('DELETE FROM vehicle_master WHERE vehicle_no = :no', { no: vehicleNo });
    const gid = await getVehiclesGroupId(conn);
    try {
      await conn.execute(
        'DELETE FROM ledger_master WHERE name = :no AND ledger_group_id = :gid',
        { no: vehicleNo, gid }
      );
    } catch (e) {
      // Ledger still referenced by a bilty — leave it; the master row is gone.
      if (!(e && e.code === 'ER_ROW_IS_REFERENCED_2')) throw e;
    }
    await conn.commit();
    return { affected: r.affectedRows };
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    if (err && err.code === 'ER_ROW_IS_REFERENCED_2') return { in_use: true };
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { findAll, findById, findByName, search, currentOwner, create, update, deleteById };
