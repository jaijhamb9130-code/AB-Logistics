'use strict';

const app = require('./app');
const env = require('./config/env');

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[backend] listening on :${env.PORT}`);
});
