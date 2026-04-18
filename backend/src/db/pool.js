'use strict';

const mysql = require('mysql2/promise');
const env = require('../config/env');

// MySQL connection pool (D-14 / T-01-14 mitigation: bounded pool prevents exhaustion)
const pool = mysql.createPool({
  uri: env.DATABASE_URL,
  connectionLimit: 10,
  waitForConnections: true,
  namedPlaceholders: true,
});

module.exports = pool;
