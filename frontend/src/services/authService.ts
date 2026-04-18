/**
 * Thin wrappers around /api/auth/* endpoints.
 * Screens / context consume THIS, never axios directly (PROJECT.md services pattern).
 */

import { http } from './httpClient';
import type { LoginResponse, RefreshResponse } from '../../../shared/types/auth';
import type { User } from '../../../shared/types/user';

export const authService = {
  async login(username: string, password: string): Promise<LoginResponse> {
    const { data } = await http.post<LoginResponse>('/api/auth/login', {
      username,
      password,
    });
    return data;
  },

  async refresh(): Promise<RefreshResponse> {
    const { data } = await http.post<RefreshResponse>('/api/auth/refresh');
    return data;
  },

  async logout(): Promise<void> {
    await http.post('/api/auth/logout');
  },

  async me(): Promise<User> {
    const { data } = await http.get<User>('/api/auth/me');
    return data;
  },
};
