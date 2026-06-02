'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const biltyRouter = require('./routes/bilty');
const freightRouter = require('./routes/freight');
const reportsRouter = require('./routes/reports');
const ledgerMasterRouter = require('./routes/ledgerMaster');
const itemMasterRouter = require('./routes/itemMaster');
const vehicleMasterRouter = require('./routes/vehicleMaster');
const destinationsRouter = require('./routes/destinations');
const ledgerGroupsRouter = require('./routes/ledgerGroups');
const itemGroupRouter = require('./routes/itemGroup');
const itemCategoryRouter = require('./routes/itemCategory');
const vchTypesRouter = require('./routes/vchTypes');
const vouchersRouter = require('./routes/vouchers');
const zoneRouter = require('./routes/zone');
const ownerRouter = require('./routes/owner');
const agentRouter = require('./routes/agent');
const branchRouter = require('./routes/branch');

const { logger } = require('./utils/logger');

const app = express();

// Trust cPanel/Apache reverse proxy so rate-limit & IP detection work correctly
app.set('trust proxy', 1);

// T-01-15 mitigation — explicit origin, credentials enabled for cookie-based refresh.
// HSTS / COOP / CSP disabled because the EB environment is HTTP-only — once HTTPS
// is provisioned (ALB + ACM cert) flip these back on.
app.use(
  helmet({
    hsts: false,
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
// Accept a single origin OR a comma-separated list (e.g. "http://localhost:8081,http://localhost:8083")
// so dev can switch between Expo ports without restarting the backend.
const allowedOrigins = env.FRONTEND_URL
  ? env.FRONTEND_URL.split(',').map((s) => s.trim()).filter(Boolean)
  : null;
app.use(
  cors({
    origin: allowedOrigins ? allowedOrigins : true,
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Health check (unversioned — monitoring tools expect stable URL)
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// v1 router — mounted at both /api and /api/v1 for backward compat during migration
const v1 = express.Router();
v1.use('/auth', authRouter);
v1.use('/users', usersRouter);
v1.use('/bilty', biltyRouter);
v1.use('/freight', freightRouter);
v1.use('/reports', reportsRouter);
v1.use('/ledger-master', ledgerMasterRouter);
v1.use('/item-master', itemMasterRouter);
v1.use('/vehicle-master', vehicleMasterRouter);
v1.use('/destinations', destinationsRouter);
v1.use('/ledger-groups', ledgerGroupsRouter);
v1.use('/item-groups', itemGroupRouter);
v1.use('/item-categories', itemCategoryRouter);
v1.use('/vch-types', vchTypesRouter);
v1.use('/vouchers', vouchersRouter);
v1.use('/zones', zoneRouter);
v1.use('/owners', ownerRouter);
v1.use('/agents', agentRouter);
v1.use('/branches', branchRouter);

app.use('/api/v1', v1);
app.use('/api', v1);

// ── Frontend static files ───────────────────────────────────────────────────
// Serve the built frontend (frontend/dist) when it exists in the deployment
// bundle. Skipped silently in dev where the frontend runs separately on :8081.
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA fallback — any non-API route returns index.html so React Navigation
  // can handle the route client-side.
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, error: { type: 'NOT_FOUND', message: 'Resource not found' } });
});

// Global error handler — maps to Strict Error Contract
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  logger.error({ err, method: req.method, url: req.url }, 'unhandled error');

  if (err && err.code === 'version_conflict') {
    return res.status(409).json({ success: false, error: { type: 'CONFLICT', message: 'Record was modified by another request. Please refresh and retry.' } });
  }
  if (err && err.code === 'bilty_no_conflict') {
    return res.status(409).json({ success: false, error: { type: 'CONFLICT', message: 'Bilty No already exists. Please use a different number.', fields: { 'header.bilty_no': 'Bilty No already exists' } } });
  }
  if (err && err.code === 'bilty_no_required') {
    return res.status(400).json({ success: false, error: { type: 'VALIDATION_ERROR', message: 'Bilty No is required.', fields: { 'header.bilty_no': 'Bilty No is required' } } });
  }
  if (err && err.code === 'bilty_not_found') {
    return res.status(404).json({ success: false, error: { type: 'NOT_FOUND', message: 'Bilty not found' } });
  }
  if (err && err.code === 'memo_not_found') {
    return res.status(404).json({ success: false, error: { type: 'NOT_FOUND', message: 'Freight memo not found' } });
  }
  if (err && err.name === 'ZodError') {
    return res.status(400).json({ success: false, error: { type: 'VALIDATION_ERROR', message: 'Validation failed', fields: err.flatten().fieldErrors } });
  }

  // Domain validation errors thrown by the bilty/freight models. These carry a
  // `<thing>_required` / `<thing>_not_found` code — surface the specific reason
  // (and the offending field) instead of a generic 500 "unexpected error".
  if (err && typeof err.code === 'string' && /_(required|not_found)$/.test(err.code)) {
    // Map a code → [field path, human message]. Field path matches the
    // frontend form so the message can render inline under the right input.
    const FIELD_MAP = {
      consignor_required: ['header.consignor', 'Consignor is required.'],
      consignor_not_found: ['header.consignor', 'Consignor is not a known ledger.'],
      truck_required: ['header.truck_no', 'Truck No is required.'],
      truck_not_found: ['header.truck_no', 'Truck No is not a known vehicle.'],
      goods_type_required: ['header.goods_type', 'Goods Type is required when the bilty has items.'],
      goods_type_not_found: ['header.goods_type', 'Goods Type is not a known item.'],
    };
    const [field, message] = FIELD_MAP[err.code] || [
      null,
      `${err.code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}.`,
    ];
    return res.status(400).json({
      success: false,
      error: {
        type: 'VALIDATION_ERROR',
        message,
        ...(field ? { fields: { [field]: message } } : {}),
      },
    });
  }

  // Missing system-config rows (e.g. the "Freight Expense"/"Sales" ledgers or
  // the "Bilty"/"Freight Journal" voucher types). Still a 500, but name the
  // missing piece so it's diagnosable instead of "unexpected".
  if (err && typeof err.code === 'string' && /^(system_ledger_missing_|.*_vchtype_missing$)/.test(err.code)) {
    return res.status(500).json({
      success: false,
      error: {
        type: 'CONFIG_ERROR',
        message: `Server is missing required setup data (${err.code}). Please contact an administrator.`,
      },
    });
  }

  res.status(500).json({ success: false, error: { type: 'SYSTEM_ERROR', message: 'An unexpected error occurred' } });
});

module.exports = app;
