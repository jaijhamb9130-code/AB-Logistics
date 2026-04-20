'use strict';

const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function main() {
  const conn = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    multipleStatements: true,
  });
  try {
    // Apply schema
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await conn.query(sql);
    console.log('[init-db] schema applied successfully');

    // Seed admin user if none exists
    const [rows] = await conn.execute('SELECT id FROM users LIMIT 1');
    if (rows.length === 0) {
      const hash = await bcrypt.hash('Admin@1234', 10);
      await conn.execute(
        `INSERT INTO users (username, password_hash, role, permissions, is_active)
         VALUES (?, ?, 'admin', '["*"]', 1)`,
        ['admin', hash]
      );
      console.log('[init-db] admin user seeded (admin / Admin@1234)');
    } else {
      // Always fix admin password hash on deploy
      const hash = await bcrypt.hash('Admin@1234', 10);
      await conn.execute(
        'UPDATE users SET password_hash = ? WHERE username = ?',
        [hash, 'admin']
      );
      console.log('[init-db] admin password hash refreshed');
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('[init-db] failed:', err.message);
  process.exit(1);
});
