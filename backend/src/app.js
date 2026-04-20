'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const biltyRouter = require('./routes/bilty');
const freightRouter = require('./routes/freight');
const ordersRouter = require('./routes/orders');
const vehiclesRouter = require('./routes/vehicles');
const reportsRouter = require('./routes/reports');
const customersRouter = require('./routes/customers');

const { logger } = require('./utils/logger');

const app = express();

// T-01-15 mitigation — explicit origin, credentials enabled for cookie-based refresh.
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
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
v1.use('/orders', ordersRouter);
v1.use('/vehicles', vehiclesRouter);
v1.use('/reports', reportsRouter);
v1.use('/customers', customersRouter);

app.use('/api/v1', v1);
app.use('/api', v1);

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
  if (err && err.code === 'bilty_not_found') {
    return res.status(404).json({ success: false, error: { type: 'NOT_FOUND', message: 'Bilty not found' } });
  }
  if (err && err.code === 'memo_not_found') {
    return res.status(404).json({ success: false, error: { type: 'NOT_FOUND', message: 'Freight memo not found' } });
  }
  if (err && err.name === 'ZodError') {
    return res.status(400).json({ success: false, error: { type: 'VALIDATION_ERROR', message: 'Validation failed', fields: err.flatten().fieldErrors } });
  }

  res.status(500).json({ success: false, error: { type: 'SYSTEM_ERROR', message: 'An unexpected error occurred' } });
});

module.exports = app;
