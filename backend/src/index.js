'use strict';

const app = require('./app');
const env = require('./config/env');
const { ensureSchema } = require('./db/ensureSchema');

(async () => {
  // Auto-apply additive schema changes (e.g. vchtype.prefix / vchtype.branch)
  // before serving, so a deploy is just `npm install` + `pm2 start` — no SQL
  // import. Failures here are logged inside ensureSchema and never block boot.
  try {
    await ensureSchema();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[schema] ensure failed:', err && err.message ? err.message : err);
  }
  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[backend] listening on :${env.PORT}`);
  });
})();
