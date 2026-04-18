/**
 * Web refresh-token store — intentional no-op (T-01-17).
 * On web, the refresh token lives ONLY in the httpOnly cookie set by the
 * backend on /api/auth/login. The browser sends it automatically with any
 * request to /api/auth/* (see httpClient `withCredentials: true`).
 * Storing it in localStorage would expose it to XSS — not done here.
 *
 * Metro resolves `tokenStorage.web.ts` automatically when the web bundler runs.
 */

export const tokenStorage = {
  async getRefresh(): Promise<string | null> {
    return null;
  },
  async setRefresh(_token: string): Promise<void> {
    /* no-op — cookie is the store */
  },
  async clearRefresh(): Promise<void> {
    /* no-op — cookie is cleared by backend on /logout */
  },
};
