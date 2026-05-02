'use strict';

const pool = require('../db/pool');

const COLS = `id, name, vehicle_type, owner_name, owner_mobile, owner_pan, chassis_no, permit_no, validity_date, driver_name, driver_mobile, tally_master_id, created_at, updated_at`;

async function findAll() {
  const [rows] = await pool.execute(
    `SELECT ${COLS} FROM vehicle_master ORDER BY name ASC`
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT ${COLS} FROM vehicle_master WHERE id = :id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

async function search(q) {
  const like = `%${q}%`;
  const [rows] = await pool.execute(
    `SELECT id, name, vehicle_type, owner_name
       FROM vehicle_master
      WHERE name LIKE :like
      ORDER BY name ASC LIMIT 50`,
    { like }
  );
  return rows;
}

async function findByName(name) {
  const [rows] = await pool.execute(
    `SELECT id FROM vehicle_master WHERE name = :name LIMIT 1`,
    { name }
  );
  return rows[0] || null;
}

async function create({ name, vehicle_type, owner_name, owner_mobile, owner_pan, chassis_no, permit_no, validity_date, driver_name, driver_mobile, tally_master_id, userId }) {
  const [r] = await pool.execute(
    `INSERT INTO vehicle_master
       (name, vehicle_type, owner_name, owner_mobile, owner_pan, chassis_no, permit_no, validity_date, driver_name, driver_mobile, tally_master_id, created_by)
     VALUES
       (:name, :vehicle_type, :owner_name, :owner_mobile, :owner_pan, :chassis_no, :permit_no, :validity_date, :driver_name, :driver_mobile, :tally_master_id, :userId)`,
    {
      name: String(name).trim().toUpperCase(),
      vehicle_type: vehicle_type || null,
      owner_name: owner_name || null,
      owner_mobile: owner_mobile || null,
      owner_pan: owner_pan ? String(owner_pan).trim().toUpperCase() : null,
      chassis_no: chassis_no ? String(chassis_no).trim().toUpperCase() : null,
      permit_no: permit_no || null,
      validity_date: validity_date || null,
      driver_name: driver_name || null,
      driver_mobile: driver_mobile || null,
      tally_master_id: tally_master_id || null,
      userId: userId ?? null,
    }
  );
  return { id: r.insertId };
}

async function update(id, { name, vehicle_type, owner_name, owner_mobile, owner_pan, chassis_no, permit_no, validity_date, driver_name, driver_mobile }) {
  await pool.execute(
    `UPDATE vehicle_master SET
       name = :name,
       vehicle_type = :vehicle_type,
       owner_name = :owner_name,
       owner_mobile = :owner_mobile,
       owner_pan = :owner_pan,
       chassis_no = :chassis_no,
       permit_no = :permit_no,
       validity_date = :validity_date,
       driver_name = :driver_name,
       driver_mobile = :driver_mobile
     WHERE id = :id`,
    {
      id,
      name: String(name).trim().toUpperCase(),
      vehicle_type: vehicle_type || null,
      owner_name: owner_name || null,
      owner_mobile: owner_mobile || null,
      owner_pan: owner_pan ? String(owner_pan).trim().toUpperCase() : null,
      chassis_no: chassis_no ? String(chassis_no).trim().toUpperCase() : null,
      permit_no: permit_no || null,
      validity_date: validity_date || null,
      driver_name: driver_name || null,
      driver_mobile: driver_mobile || null,
    }
  );
}

module.exports = { findAll, findById, findByName, search, create, update };
