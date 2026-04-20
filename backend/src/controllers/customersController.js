'use strict';

const customerModel = require('../models/customerModel');

function parseId(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

// GET /api/customers
exports.list = async (_req, res, next) => {
  try {
    const rows = await customerModel.findAll();
    return res.status(200).json(rows);
  } catch (err) {
    return next(err);
  }
};

// GET /api/customers/search?q=
exports.search = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length === 0) return res.status(200).json([]);
    const rows = await customerModel.search(q);
    return res.status(200).json(rows);
  } catch (err) {
    return next(err);
  }
};

// GET /api/customers/:id
exports.get = async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'invalid_id' });
    const row = await customerModel.findById(id);
    if (!row) return res.status(404).json({ error: 'customer_not_found' });
    return res.status(200).json(row);
  } catch (err) {
    return next(err);
  }
};

// POST /api/customers
exports.create = async (req, res, next) => {
  try {
    const body = req.body || {};
    const { name, phone_number, address, city, state, pincode } = body;

    if (!isNonEmptyString(name)) {
      return res.status(400).json({ error: 'invalid_name' });
    }
    if (phone_number != null && phone_number !== '') {
      const digits = String(phone_number).replace(/\D/g, '');
      if (digits.length !== 10) {
        return res.status(400).json({ error: 'invalid_phone', message: 'Phone number must be exactly 10 digits' });
      }
    }

    const userId = req.user ? req.user.id : null;
    const { id, customer_no } = await customerModel.create({
      name, phone_number, address, city, state, pincode, userId,
    });

    return res.status(201).json({ id, customer_no });
  } catch (err) {
    return next(err);
  }
};
