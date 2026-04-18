/**
 * Pure validators for the Order form + status pipeline (Phase 5).
 *
 * The status pipeline is enforced server-side (backend returns 400
 * invalid_status_transition); this module mirrors the rule so the client can
 * disable the "Advance Status" button when the next transition is illegal.
 */

import type { OrderStatus } from '../../../shared/types/order';
import { nextStatus } from '../../../shared/types/order';

export type OrderFieldError = 'required';

export interface OrderErrors {
  customer_name?: OrderFieldError;
}

export interface OrderFormInput {
  customer_name: string;
  order_date?: string;
  from_loc?: string;
  to_loc?: string;
  goods_desc?: string;
  vehicle_id?: number | null;
}

export function validateOrder(input: OrderFormInput): OrderErrors {
  const errs: OrderErrors = {};
  if (!input.customer_name || !input.customer_name.trim()) {
    errs.customer_name = 'required';
  }
  return errs;
}

export function canAdvance(current: OrderStatus): boolean {
  return nextStatus(current) !== null;
}

export { nextStatus };
