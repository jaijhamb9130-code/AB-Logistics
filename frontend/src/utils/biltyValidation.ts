/**
 * Phase 3 — pure client-side bilty form validation.
 *
 * Mirrors the backend's minimum contract (consignor, truck_no, ≥1 item with
 * qty>0 && rate>0). Totals helpers also live here so they can be covered in
 * the unit tests without pulling in the RN renderer.
 */

import type {
  BiltyHeader,
  BiltyItem,
} from '../../../shared/types/bilty';

export type BiltyFormErrors = {
  consignor?: 'required';
  truck_no?: 'required';
  items?: 'required' | 'invalid_row';
};

export function toNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function validateBilty(
  header: BiltyHeader,
  items: BiltyItem[]
): BiltyFormErrors {
  const errs: BiltyFormErrors = {};
  if (!header.consignor || String(header.consignor).trim() === '') {
    errs.consignor = 'required';
  }
  if (!header.truck_no || String(header.truck_no).trim() === '') {
    errs.truck_no = 'required';
  }
  if (!Array.isArray(items) || items.length === 0) {
    errs.items = 'required';
  } else {
    const bad = items.some(
      (it) => toNum(it.qty) <= 0 || toNum(it.rate) <= 0
    );
    if (bad) errs.items = 'invalid_row';
  }
  return errs;
}

export function hasErrors(errs: BiltyFormErrors): boolean {
  return Object.keys(errs).length > 0;
}

// Totals used by the detail screen (and previewable in the form).
export function itemsTotal(items: BiltyItem[]): number {
  return (items || []).reduce(
    (sum, it) => sum + toNum(it.qty) * toNum(it.rate),
    0
  );
}

export function netPayable(items: BiltyItem[]): number {
  return itemsTotal(items);
}
