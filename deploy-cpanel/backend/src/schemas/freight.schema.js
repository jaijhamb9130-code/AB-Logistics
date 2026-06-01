'use strict';

const { z } = require('zod');

const GenerateFreightSchema = z.object({
  bilty_id: z.coerce.number().int().positive({ message: 'bilty_id must be a positive integer' }),
});

module.exports = { GenerateFreightSchema };
