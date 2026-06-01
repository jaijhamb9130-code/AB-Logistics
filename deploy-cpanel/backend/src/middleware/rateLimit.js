'use strict';

// T-01-07 mitigation — brute-force resistance on login.
const { rateLimit, MemoryStore } = require('express-rate-limit');

const loginStore = new MemoryStore();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
  store: loginStore,
});

exports.loginLimiter = loginLimiter;

// Test-only helper — reset counters between tests so rate-limit state does
// not bleed across describes within a single Jest file.
exports.resetLoginLimiter = () => {
  if (loginStore && typeof loginStore.resetAll === 'function') {
    loginStore.resetAll();
  }
};
