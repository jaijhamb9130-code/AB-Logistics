/**
 * Shared order types (Phase 5). Mirrored by backend orderModel + controller.
 *
 * Status pipeline (enforced server-side):
 *   pending → in_progress → completed
 * Any other target transition returns 400 invalid_status_transition.
 */

export type OrderStatus = 'pending' | 'in_progress' | 'completed';

export const ORDER_STATUSES: readonly OrderStatus[] = [
  'pending',
  'in_progress',
  'completed',
] as const;

/** Next legal status for the pipeline — null if already at the terminal state. */
export function nextStatus(current: OrderStatus): OrderStatus | null {
  if (current === 'pending') return 'in_progress';
  if (current === 'in_progress') return 'completed';
  return null;
}

/** Row shape returned by GET /api/orders (list). vehicle_no joined via LEFT JOIN. */
export interface OrderListItem {
  id: number;
  order_no: string;
  order_date: string | null;
  customer_name: string;
  from_loc: string | null;
  to_loc: string | null;
  goods_desc: string | null;
  status: OrderStatus;
  vehicle_id: number | null;
  vehicle_no: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

/** Full order returned by GET /api/orders/:id. Adds joined vehicle metadata. */
export interface OrderDetail extends OrderListItem {
  vehicle_type?: string | null;
  vehicle_owner_name?: string | null;
}

export interface CreateOrderRequest {
  order_date?: string | null;
  customer_name: string;
  from_loc?: string | null;
  to_loc?: string | null;
  goods_desc?: string | null;
  vehicle_id?: number | null;
}

export interface CreateOrderResponse {
  id: number;
  order_no: string;
}

export interface UpdateStatusRequest {
  status: OrderStatus;
}

export interface AssignVehicleRequest {
  vehicle_id: number;
}
