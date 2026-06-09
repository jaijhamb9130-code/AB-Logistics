import { useCallback, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * useAutoRefresh — keeps a screen's data fresh without manual reloads.
 *
 *   1. Calls `load` immediately on mount.
 *   2. Re-runs `load` every time the screen regains focus (so switching tabs
 *      and coming back always shows the latest data).
 *   3. Polls in the background every `intervalMs` while the screen is mounted
 *      — so when User A creates a row, User B's open page picks it up within
 *      one polling cycle.
 *
 * Safe to use in any screen — pass a stable `load` (memoize with useCallback).
 *
 * @param load        async or sync function that fetches data
 * @param intervalMs  poll interval in milliseconds; default 15s
 */
export function useAutoRefresh(load: () => void | Promise<void>, intervalMs = 15000) {
  const run = useCallback(() => {
    load();
  }, [load]);

  // 1) Mount-time fetch.
  useEffect(() => {
    run();
  }, [run]);

  // 2) Re-fetch on screen focus (covers tab switches inside the app).
  useFocusEffect(
    useCallback(() => {
      run();
    }, [run])
  );

  // 2b) Web: refetch when the browser tab/window becomes active again.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onFocus = () => run();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') run();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [run]);

  // 3) Periodic background poll.
  useEffect(() => {
    const id = setInterval(() => {
      run();
    }, intervalMs);
    return () => clearInterval(id);
  }, [run, intervalMs]);
}
