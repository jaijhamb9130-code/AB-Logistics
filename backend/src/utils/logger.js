'use strict';

const pino = require('pino');

const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    base: { service: 'ab-logistics-backend' },
  },
  process.env.NODE_ENV !== 'production'
    ? pino.transport({ target: 'pino-pretty', options: { colorize: true } })
    : undefined
);

/**
 * Create a child logger bound to a request context.
 * @param {{ requestId?: string, userId?: number, method?: string }} ctx
 */
function childLogger(ctx) {
  return logger.child(ctx);
}

module.exports = { logger, childLogger };
