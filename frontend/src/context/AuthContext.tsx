/**
 * AuthContext — global auth state (AUTH-05, D-13).
 *
 * Stores:
 *  - user      : hydrated from /api/auth/me after login or successful bootstrap refresh
 *  - accessToken : in-memory ONLY (useRef + useState). Never written to disk.
 *
 * Refresh token:
 *  - Native : expo-secure-store (tokenStorage.ts) — backend returns tokens in body.
 *  - Web    : httpOnly cookie set by backend; browser sends it automatically.
 *
 * Exposed API (AuthContextValue):
 *   user, accessToken, isAuthenticated, isLoading, login(u,p), logout()
 *
 * Bootstrap flow:
 *   On mount, POST /api/auth/refresh — if the cookie / stored refresh token is
 *   valid we silently re-hydrate the session; if it 401s, we stay on Login.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { authService } from '../services/authService';
import { configureHttp } from '../services/httpClient';
import type { User } from '../../../shared/types/user';

export interface AuthContextValue {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  /** true during initial bootstrap AND during an in-flight login() call */
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Memory-only access token per D-13 / T-01-16.
  const accessTokenRef = useRef<string | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const setAccessToken = useCallback((t: string | null) => {
    accessTokenRef.current = t;
    setAccessTokenState(t);
  }, []);

  // Register hooks into the shared axios instance exactly once.
  useEffect(() => {
    configureHttp({
      getAccessToken: () => accessTokenRef.current,
      setAccessToken: (t) => setAccessToken(t),
      onAuthFailure: () => {
        setAccessToken(null);
        setUser(null);
      },
    });
  }, [setAccessToken]);

  // Bootstrap: attempt silent refresh on mount.
  // On web the httpOnly cookie is sent automatically (withCredentials: true).
  // On native with no stored refresh yet, this 401s — we swallow and land on Login.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { accessToken: bootToken } = await authService.refresh();
        if (cancelled) return;
        setAccessToken(bootToken);
        const u = await authService.me();
        if (cancelled) return;
        setUser(u);
      } catch {
        /* not logged in — stay on Login */
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setAccessToken]);

  const login = useCallback(
    async (username: string, password: string) => {
      setIsLoading(true);
      try {
        const { user: u, accessToken: token } = await authService.login(
          username,
          password
        );
        setAccessToken(token);
        setUser(u);
      } finally {
        setIsLoading(false);
      }
    },
    [setAccessToken]
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      /* ignore — always clear local state */
    }
    setAccessToken(null);
    setUser(null);
  }, [setAccessToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: !!user && !!accessToken,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
