'use strict';

/**
 * One-shot — converts the retired `report.*` permission strings into
 * `daybook.view` (the only meaningful action on the daybook page).
 * Idempotent: rows already migrated are skipped.
 *
 * Usage:  node backend/scripts/migrate-perms-report-to-daybook.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mysql = require('mysql2/promise');
const env = require('../src/config/env');
const { PERMISSIONS } = require('../src/constants/permissions');

const VALID = new Set(PERMISSIONS);

function fix(perms) {
  const out = new Set();
  let touched = false;
  for (const p of perms || []) {
    if (p === '*') { out.add('*'); continue; }
    if (typeof p !== 'string') continue;
    if (p.startsWith('report.')) {
      // Any report.* legacy perm becomes daybook.view — daybook is view-only.
      out.add('daybook.view');
      touched = true;
      continue;
    }
    if (VALID.has(p)) {
      out.add(p);
    } else {
      // Drop unknowns; not in current vocabulary.
      console.warn(`[migrate-perms] dropping unknown permission: ${p}`);
      touched = true;
    }
  }
  return { perms: Array.from(out).sort(), touched };
}

(async () => {
  const conn = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });
  try {
    const [rows] = await conn.execute('SELECT id, username, permissions FROM users');
    let updated = 0, skipped = 0;
    for (const row of rows) {
      const before = (() => {
        if (Array.isArray(row.permissions)) return row.permissions;
        if (typeof row.permissions === 'string') {
          try { return JSON.parse(row.permissions); } catch { return []; }
        }
        return [];
      })();
      const { perms: after, touched } = fix(before);
      if (!touched && JSON.stringify([...before].sort()) === JSON.stringify(after)) {
        skipped += 1;
        continue;
      }
      await conn.execute(
        'UPDATE users SET permissions = ? WHERE id = ?',
        [JSON.stringify(after), row.id]
      );
      console.log(`[migrate-perms] ${row.username} (id=${row.id})`);
      console.log(`  before: ${JSON.stringify(before)}`);
      console.log(`  after:  ${JSON.stringify(after)}`);
      updated += 1;
    }
    console.log(`[migrate-perms] done. updated=${updated}, skipped=${skipped}`);
  } finally {
    await conn.end();
  }
  process.exit(0);
})().catch((err) => {
  console.error('[migrate-perms] failed:', err && err.message ? err.message : err);
  process.exit(1);
});
