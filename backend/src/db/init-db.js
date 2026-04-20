'use strict';

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function main() {
  const conn = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    multipleStatements: true,
  });
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await conn.query(sql);
    console.log('[init-db] schema applied successfully');
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('[init-db] failed:', err.message);
  process.exit(1);
});
