'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');

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

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// Auth (BE-04, BE-05)
app.use('/api/auth', authRouter);

// Users (Phase 02 — admin-only; guard applied at router level, T-02-01)
app.use('/api/users', usersRouter);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error('[backend] error:', err && err.message ? err.message : err);
  res.status(500).json({ error: 'server_error' });
});

module.exports = app;
