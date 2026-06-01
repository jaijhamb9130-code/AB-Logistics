'use strict';

const pool = require('../db/pool');

const COLS = `id, branch, name, city, state, pincode, tally_master_id, created_at, updated_at`;

async function findAll(branch) {
  if (branch === null || branch === undefined || branch === '') {
    const [rows] = await pool.execute(
      `SELECT ${COLS} FROM destination_master ORDER BY branch IS NULL, branch ASC, name ASC`
    );
    return rows;
  }
  const [rows] = await pool.execute(
    `SELECT ${COLS} FROM destination_master WHERE branch = :branch ORDER BY name ASC`,
    { branch }
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT ${COLS} FROM destination_master WHERE id = :id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

// Distinct branch names — feeds Bilty Branch dropdown.
async function listBranches() {
  const [rows] = await pool.execute(
    `SELECT DISTINCT branch
       FROM destination_master
      WHERE branch IS NOT NULL AND branch <> ''
      ORDER BY branch ASC`
  );
  return rows.map((r) => r.branch);
}

// Branch autocomplete for the Branch dropdown.
async function searchBranches(q) {
  const like = `%${q}%`;
  const [rows] = await pool.execute(
    `SELECT DISTINCT branch
       FROM destination_master
      WHERE branch IS NOT NULL AND branch <> '' AND branch LIKE :like
      ORDER BY branch ASC LIMIT 50`,
    { like }
  );
  return rows.map((r) => r.branch);
}

// Location autocomplete (From/To dropdowns). If branch given, filter to that branch.
async function searchLocations(q, branch) {
  const like = `%${q}%`;
  if (branch && String(branch).trim() !== '') {
    const [rows] = await pool.execute(
      `SELECT id, branch, name, city, state
         FROM destination_master
        WHERE branch = :branch AND (name LIKE :like OR city LIKE :like)
        ORDER BY name ASC LIMIT 50`,
      { branch, like }
    );
    return rows;
  }
  const [rows] = await pool.execute(
    `SELECT id, branch, name, city, state
       FROM destination_master
      WHERE name LIKE :like OR city LIKE :like
      ORDER BY name ASC LIMIT 50`,
    { like }
  );
  return rows;
}

async function create({ branch, name, city, state, pincode, tally_master_id, userId }) {
  const [r] = await pool.execute(
    `INSERT INTO destination_master (branch, name, city, state, pincode, tally_master_id, created_by)
     VALUES (:branch, :name, :city, :state, :pincode, :tally_master_id, :userId)`,
    {
      branch: branch ? String(branch).trim() : null,
      name: String(name).trim(),
      city: city || null,
      state: state || null,
      pincode: pincode || null,
      tally_master_id: tally_master_id || null,
      userId: userId ?? null,
    }
  );
  return { id: r.insertId };
}

async function update(id, { branch, name, city, state, pincode }) {
  await pool.execute(
    `UPDATE destination_master SET
       branch = :branch,
       name = :name,
       city = :city,
       state = :state,
       pincode = :pincode
     WHERE id = :id`,
    {
      id,
      branch: branch ? String(branch).trim() : null,
      name: String(name).trim(),
      city: city || null,
      state: state || null,
      pincode: pincode || null,
    }
  );
}

async function deleteById(id) {
  try {
    const [r] = await pool.execute(
      `DELETE FROM destination_master WHERE id = :id`,
      { id }
    );
    return { affected: r.affectedRows };
  } catch (err) {
    if (err && err.code === 'ER_ROW_IS_REFERENCED_2') {
      return { in_use: true };
    }
    throw err;
  }
}

module.exports = {
  findAll,
  findById,
  listBranches,
  searchBranches,
  searchLocations,
  create,
  update,
  deleteById,
};
