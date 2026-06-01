'use strict';

// D-20 — seed the first admin user. Idempotent: prints and exits if admin exists.
// Password is read from SEED_ADMIN_PASSWORD or generated (base64url, 12 chars).
require('dotenv').config();

const crypto = require('crypto');
const { hashPassword } = require('../src/utils/password');
const userModel = require('../src/models/userModel');
const pool = require('../src/db/pool');

(async () => {
  const existing = await userModel.findByUsername('admin');
  if (existing) {
    // eslint-disable-next-line no-console
    console.log('[seed-admin] admin user already exists — skipping. Id:', existing.id);
    await pool.end();
    process.exit(0);
  }

  const password =
    process.env.SEED_ADMIN_PASSWORD ||
    crypto.randomBytes(9).toString('base64url');
  const password_hash = await hashPassword(password);

  const id = await userModel.create({
    username: 'admin',
    password_hash,
    role: 'admin',
    permissions: ['*'],
  });

  // eslint-disable-next-line no-console
  console.log('\n================ AB LOGISTICS — ADMIN SEEDED ================');
  // eslint-disable-next-line no-console
  console.log(' username: admin');
  // eslint-disable-next-line no-console
  console.log(' password:', password);
  // eslint-disable-next-line no-console
  console.log(' user id :', id);
  // eslint-disable-next-line no-console
  console.log(' CHANGE THIS PASSWORD AFTER FIRST LOGIN.');
  // eslint-disable-next-line no-console
  console.log('=============================================================\n');

  await pool.end();
  process.exit(0);
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed-admin] failed:', err && err.message ? err.message : err);
  process.exit(1);
});
