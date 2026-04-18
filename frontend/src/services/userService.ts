/**
 * Typed wrapper around /api/users/* endpoints (plan 02-02).
 *
 * All requests ride the shared `http` instance — Bearer attach + one-shot
 * refresh interceptor are already wired by AuthProvider (Phase 1).
 *
 * `update` and `deactivate` are declared here so plan 02-03 can reuse them
 * without reopening this file.
 */

import { http } from './httpClient';
import type {
  CreateUserRequest,
  UpdateUserRequest,
  UserListItem,
} from '../../../shared/types/user';

export const userService = {
  async list(): Promise<UserListItem[]> {
    const { data } = await http.get<UserListItem[]>('/api/users');
    return data;
  },

  async get(id: number): Promise<UserListItem> {
    const { data } = await http.get<UserListItem>(`/api/users/${id}`);
    return data;
  },

  async create(body: CreateUserRequest): Promise<UserListItem> {
    const { data } = await http.post<UserListItem>('/api/users', body);
    return data;
  },

  // Used by plan 02-03 (edit user).
  async update(id: number, body: UpdateUserRequest): Promise<UserListItem> {
    const { data } = await http.patch<UserListItem>(`/api/users/${id}`, body);
    return data;
  },

  // Used by plan 02-03 (deactivate user).
  async deactivate(id: number): Promise<UserListItem> {
    const { data } = await http.post<UserListItem>(`/api/users/${id}/deactivate`);
    return data;
  },

  // Plan 02-04 addendum (reactivation). Backend: POST /api/users/:id/activate.
  // setActive only flips is_active — permissions column is untouched, so the
  // returned row carries the user's prior permission set intact.
  async activate(id: number): Promise<UserListItem> {
    const { data } = await http.post<UserListItem>(`/api/users/${id}/activate`);
    return data;
  },
};
