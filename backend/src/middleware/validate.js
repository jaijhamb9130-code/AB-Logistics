'use strict';

/**
 * Express middleware factory — validates req.body against a Zod schema.
 * On failure returns the Strict Error Contract shape from shared/constants/errors.
 *
 * @param {import('zod').ZodTypeAny} schema
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fields = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_root';
        if (!fields[key]) fields[key] = issue.message;
      }
      return res.status(400).json({
        success: false,
        error: {
          type: 'VALIDATION_ERROR',
          message: 'Validation failed',
          fields,
        },
      });
    }
    req.body = result.data;
    next();
  };
}

module.exports = { validate };
