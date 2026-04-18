/**
 * Phase 5 — typed wrapper around /api/orders/*.
 */

import { http } from './httpClient';
import type {
  CreateOrderRequest,
  CreateOrderResponse,
  OrderDetail,
  OrderListItem,
  OrderStatus,
} from '../../../shared/types/order';

export const orderService = {
  async list(): Promise<OrderListItem[]> {
    const { data } = await http.get<OrderListItem[]>('/api/orders');
    return data;
  },

  async get(id: number): Promise<OrderDetail> {
    const { data } = await http.get<OrderDetail>(`/api/orders/${id}`);
    return data;
  },

  async create(body: CreateOrderRequest): Promise<CreateOrderResponse> {
    const { data } = await http.post<CreateOrderResponse>('/api/orders', body);
    return data;
  },

  async updateStatus(id: number, status: OrderStatus): Promise<OrderDetail> {
    const { data } = await http.patch<OrderDetail>(`/api/orders/${id}/status`, { status });
    return data;
  },

  async assignVehicle(id: number, vehicle_id: number): Promise<OrderDetail> {
    const { data } = await http.patch<OrderDetail>(`/api/orders/${id}/vehicle`, { vehicle_id });
    return data;
  },
};
