'use strict';

// Indian format validators — all return null on valid (or empty optional input),
// or a short error code string on invalid.

// GST: 15 chars — 2 state + 10 PAN + 1 entity + 1 'Z' + 1 checksum (e.g. 22AAAAA0000A1Z5)
const GST_RX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
// PAN: 10 chars — 5 letters + 4 digits + 1 letter (e.g. AAAAA0000A)
const PAN_RX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const PIN_RX = /^[0-9]{6}$/;
const MOB_RX = /^[0-9]{10}$/;
const DATE_RX = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function validateGST(v) {
  if (v == null || v === '') return null;
  return GST_RX.test(String(v).toUpperCase()) ? null : 'invalid_gst';
}

function validatePAN(v) {
  if (v == null || v === '') return null;
  return PAN_RX.test(String(v).toUpperCase()) ? null : 'invalid_pan';
}

function validatePincode(v) {
  if (v == null || v === '') return null;
  return PIN_RX.test(String(v)) ? null : 'invalid_pincode';
}

function validateMobile(v) {
  if (v == null || v === '') return null;
  return MOB_RX.test(String(v).replace(/\D/g, '')) ? null : 'invalid_mobile';
}

function validateDate(v) {
  if (v == null || v === '') return null;
  if (!DATE_RX.test(String(v))) return 'invalid_date';
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? 'invalid_date' : null;
}

function parseId(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

module.exports = {
  isNonEmptyString,
  validateGST,
  validatePAN,
  validatePincode,
  validateMobile,
  validateDate,
  parseId,
};
