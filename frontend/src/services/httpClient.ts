/**
 * Central axios instance for all backend calls.
 *
 * Responsibilities:
 *  - Attach Bearer access token on every request (from in-memory getter).
 *  - On 401 from protected calls, silently POST /api/auth/refresh once,
 *    then retry the original request (T-01-21).
 *  - Coalesce concurrent 401s behind a single refresh — pending requests
 *    wait in a queue for the refreshed token (isRefreshing lock).
 *  - Skip refresh flow for /api/auth/* calls themselves to avoid recursion.
 *
 * Wiring: AuthProvider calls `configureHttp({ getAccessToken, setAccessToken, onAuthFailure })`
 * exactly once at mount. Until then, the interceptors are safe no-ops.
 */

import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { API_URL } from '../constants/env';

export const http = axios.create({
  baseURL: API_URL,
  withCredentials: true, // send httpOnly refresh cookie on web
  timeout: 15000,
});

// ---- Hooks registered by AuthProvider ------------------------------------

let accessTokenGetter: () => string | null = () => null;
let onRefreshed: (token: string) => void = () => {};
let onAuthFailure: () => void = () => {};

export function configureHttp(opts: {
  getAccessToken: () => string | null;
  setAccessToken: (t: string) => void;
  onAuthFailure: () => void;
}): void {
  accessTokenGetter = opts.getAccessToken;
  onRefreshed = opts.setAccessToken;
  onAuthFailure = opts.onAuthFailure;
}

// ---- Request interceptor: attach Bearer ----------------------------------

http.interceptors.request.use((cfg) => {
  const token = accessTokenGetter();
  if (token) {
    cfg.headers = { ...cfg.headers, Authorization: `Bearer ${token}` } as typeof cfg.headers;
  }
  return cfg;
});

// ---- Response interceptor: one-shot refresh on 401 -----------------------

type RetryConfig = AxiosRequestConfig & { _retry?: boolean };

let isRefreshing = false;
let pending: Array<(token: string | null) => void> = [];

http.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as RetryConfig | undefined;

    // Only attempt refresh for 401s on protected calls.
    // Skip: no config, non-401, already retried, or this IS an /api/auth/* call.
    if (
      !original ||
      error.response?.status !== 401 ||
      original._retry ||
      (typeof original.url === 'string' && original.url.includes('/api/auth/'))
    ) {
      throw error;
    }

    original._retry = true;

    // If another request is already refreshing, queue until it finishes.
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pending.push((token) => {
          if (!token) {
            reject(error);
            return;
          }
          original.headers = {
            ...original.headers,
            Authorization: `Bearer ${token}`,
          } as typeof original.headers;
          resolve(http(original));
        });
      });
    }

    isRefreshing = true;
    try {
      const { data } = await http.post<{ accessToken: string }>('/api/auth/refresh');
      const newToken = data.accessToken;
      onRefreshed(newToken);
      pending.forEach((fn) => fn(newToken));
      pending = [];
      original.headers = {
        ...original.headers,
        Authorization: `Bearer ${newToken}`,
      } as typeof original.headers;
      return http(original);
    } catch (refreshErr) {
      pending.forEach((fn) => fn(null));
      pending = [];
      onAuthFailure();
      throw refreshErr;
    } finally {
      isRefreshing = false;
    }
  }
);
