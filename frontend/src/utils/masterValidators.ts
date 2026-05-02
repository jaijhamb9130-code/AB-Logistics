/**
 * Indian-format validators for master data forms (mirror backend validators.js).
 * Each returns an error code string on invalid, or null on valid (or empty optional).
 *
 * Error codes are friendly labels — screens render them directly under the field.
 */

const GST_RX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const PIN_RX = /^[0-9]{6}$/;
const MOB_RX = /^[0-9]{10}$/;
const DATE_RX = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

export function validateGST(v: string | null | undefined): string | null {
  if (v == null || v === '') return null;
  return GST_RX.test(v.toUpperCase().trim()) ? null : 'GST format is invalid (e.g. 22AAAAA0000A1Z5)';
}

export function validatePAN(v: string | null | undefined): string | null {
  if (v == null || v === '') return null;
  return PAN_RX.test(v.toUpperCase().trim()) ? null : 'PAN format is invalid (e.g. AAAAA0000A)';
}

export function validatePincode(v: string | null | undefined): string | null {
  if (v == null || v === '') return null;
  return PIN_RX.test(v.trim()) ? null : 'Pincode must be 6 digits';
}

export function validateMobile(v: string | null | undefined): string | null {
  if (v == null || v === '') return null;
  const digits = v.replace(/\D/g, '');
  return MOB_RX.test(digits) ? null : 'Mobile must be 10 digits';
}

export function validateDate(v: string | null | undefined): string | null {
  if (v == null || v === '') return null;
  if (!DATE_RX.test(v)) return 'Use YYYY-MM-DD format';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 'Date is invalid' : null;
}

export function validateGstRate(v: string | number | null | undefined): string | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) return 'GST rate must be between 0 and 100';
  return null;
}

export function validateRequired(v: string | null | undefined, label = 'This field'): string | null {
  return v && v.trim().length > 0 ? null : `${label} is required`;
}
