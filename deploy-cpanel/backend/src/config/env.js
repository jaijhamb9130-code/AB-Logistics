'use strict';

require('dotenv').config();

module.exports = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DB_HOST:     process.env.DB_HOST     || 'localhost',
  DB_PORT:     parseInt(process.env.DB_PORT || '3306', 10),
  DB_USERNAME: process.env.DB_USERNAME,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_NAME:     process.env.DB_NAME,
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL || '15m',
  JWT_REFRESH_TTL: process.env.JWT_REFRESH_TTL || '7d',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:8081',
  // Set COOKIE_SECURE=true ONLY when serving over HTTPS (ALB + ACM cert).
  // On HTTP, secure cookies are silently dropped by the browser.
  COOKIE_SECURE: process.env.COOKIE_SECURE === 'true',
  // Home state of the company (case-insensitive). Used to decide IGST vs
  // CGST/SGST when saving a bilty: same-state customer → CGST + SGST split,
  // different-state → IGST single. Match the spelling/casing you use in
  // ledger_master.state for customer rows.
  COMPANY_STATE: (process.env.COMPANY_STATE || '').trim(),
};
