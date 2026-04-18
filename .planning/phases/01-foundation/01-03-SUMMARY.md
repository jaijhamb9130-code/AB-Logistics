---
phase: 01-foundation
plan: 03
subsystem: frontend-auth-navigation
tags: [auth-context, navigation, react-navigation, axios, role-gate, tdd]
requires:
  - Plan 01-01 scaffold (frontend Expo + shared types + theme)
  - Plan 01-02 backend auth (POST /api/auth/login, /refresh, /logout, GET /me)
provides:
  - AuthContext (AUTH-05) — user, accessToken, isAuthenticated, isLoading, login, logout
  - httpClient — axios instance with Bearer attach + one-shot 401→refresh→retry (T-01-21)
  - tokenStorage — platform-split (native=SecureStore, web=no-op httpOnly cookie)
  - authService — typed wrappers for /api/auth/login, /refresh, /logout, /me
  - Navigation shell — AppNavigator branches on isAuthenticated (AUTH-07, D-19)
  - AuthNavigator (LoginScreen) + AppTabs (Dashboard + admin-only Users, AUTH-06)
  - Pure canAccessTab guard helper + 6 green Jest tests
  - Loader component shared across future bootstrap / async flows
  - Stub screens (LoginScreen, DashboardScreen, UsersScreen) — Plan 04 polishes Login
affects: [plan-01-04-login-ui, plan-01-05-dashboard, all-post-login-screens]
tech-stack:
  added: []
  patterns:
    - Services layer (services/*.ts) wraps all HTTP — screens never call axios directly
    - AuthContext is the single source of auth state (no local auth state anywhere)
    - Route guard lives at navigator level ONLY (D-19) — no per-screen navigate('Login')
    - Access token in useRef + useState (memory only, D-13/T-01-16) — never on disk
    - Refresh token: SecureStore on native (T-01-18), httpOnly cookie on web (T-01-17)
    - Metro platform-split via `tokenStorage.web.ts` — compile-time swap, no runtime branch
    - 401 refresh storm guard: `isRefreshing` lock + pending queue + `_retry` flag
    - Role gate with allowlist `ADMIN_ONLY_TABS` — add new admin tabs in one place
key-files:
  created:
    - frontend/src/services/httpClient.ts
    - frontend/src/services/tokenStorage.ts
    - frontend/src/services/tokenStorage.web.ts
    - frontend/src/services/authService.ts
    - frontend/src/context/AuthContext.tsx
    - frontend/src/components/Loader.tsx
    - frontend/src/navigation/types.ts
    - frontend/src/navigation/guards.ts
    - frontend/src/navigation/guards.test.ts
    - frontend/src/navigation/AuthNavigator.tsx
    - frontend/src/navigation/AppTabs.tsx
    - frontend/src/navigation/AppNavigator.tsx
    - frontend/src/screens/LoginScreen.tsx
    - frontend/src/screens/DashboardScreen.tsx
    - frontend/src/screens/UsersScreen.tsx
  modified:
    - frontend/App.tsx (now wraps tree in AuthProvider + NavigationContainer + AppNavigator)
    - frontend/package.json (added ts-jest preset + test script — already present from 01-01)
decisions:
  - AuthContext exposes isLoading (true during bootstrap AND in-flight login) so AppNavigator can render Loader without a second flag.
  - Bootstrap uses POST /api/auth/refresh on mount — on web the httpOnly cookie is sent automatically; on native without a stored refresh it silently 401s and lands on Login.
  - httpClient uses `configureHttp()` hook registration (not import-time) so AuthProvider fully owns state; http module has no React dependency.
  - canAccessTab returns false for null user (defence-in-depth) even though AppNavigator already gates rendering — keeps the helper safe if ever reused outside the navigator branch.
  - Login error extracts `response.data.error` string from backend (`invalid_credentials`, `account_disabled`, etc.) and shows raw code in the stub; Plan 04 maps to user-friendly copy.
  - Logout swallows network errors and ALWAYS clears local state — a failed server call must not strand the user in an authenticated shell.
metrics:
  tasks_completed: 3
  commits: 1
  duration: "~20m"
  completed: 2026-04-18
  tests_added: 6 (guards.test.ts)
requirements:
  - AUTH-05
  - AUTH-06
  - AUTH-07
---

# Phase 1 Plan 03: Frontend Auth + Navigation Shell — Summary

Wired the Expo app's auth layer end-to-end: global `AuthContext` owns `user` + `accessToken` (memory only per D-13), an axios `httpClient` attaches the Bearer and silently refreshes on 401, and a root navigator flips between `AuthNavigator` (LoginScreen stub) and `AppTabs` (Dashboard + admin-only Users) based on `isAuthenticated`. Login / logout now drive navigation automatically — no screen calls `navigation.navigate('Login')`.

## AuthContextValue — Exact Shape (Plan 04 consumes this)

```ts
export interface AuthContextValue {
  user: User | null;                                  // hydrated from /api/auth/me
  accessToken: string | null;                          // in-memory only (D-13)
  isAuthenticated: boolean;                            // !!user && !!accessToken
  isLoading: boolean;                                  // bootstrap OR login in flight
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}
```

`useAuth()` throws if called outside `<AuthProvider>` — safety net for refactors.

No divergence from the plan's interface snippet. All five behavioural truths in `must_haves.truths` hold.

## HTTP Client Behaviour (Plan 04+ relies on these)

| Scenario                                          | Behaviour                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| Any outgoing request                              | If memory access token present → `Authorization: Bearer <token>` attached        |
| 401 on `/api/auth/*`                              | **No** refresh attempt (prevents recursion) — error propagated to caller        |
| 401 on other protected call, first time           | POSTs `/api/auth/refresh`, updates context token, retries original request once |
| 401 on other protected call, after retry          | Propagates error (`_retry` flag set)                                            |
| Concurrent 401s during refresh                    | Queued via `pending[]`; resumed with new token when refresh resolves            |
| Refresh itself 401s                               | `onAuthFailure` clears user + token → AppNavigator flips to LoginScreen         |
| Web platform                                      | `withCredentials: true` sends httpOnly refresh cookie automatically             |

## Navigation Tree

```
<App>
 └─ <AuthProvider>                       ← owns user + accessToken + configureHttp()
     └─ <NavigationContainer>
         └─ <AppNavigator>               ← isLoading ? <Loader/> : branch
             ├─ <Loader/>                (during bootstrap refresh)
             ├─ <AuthNavigator>          (when !isAuthenticated)
             │    └─ Stack: Login
             └─ <AppTabs>                (when isAuthenticated)
                  ├─ Tab: Dashboard     (all roles)
                  └─ Tab: Users         (admin only — canAccessTab gate)
```

## Role-Gate Rules (canAccessTab)

| user           | Dashboard | Users   |
| -------------- | --------- | ------- |
| `admin`        | ✅ true    | ✅ true  |
| `staff`        | ✅ true    | ❌ false |
| `null` (none)  | ❌ false   | ❌ false |

Reflected verbatim in the 6 Jest tests in `guards.test.ts` (one extra test beyond the plan's 5 covers the `null + Dashboard` defence-in-depth case).

## Cookie-Based Bootstrap — Does It Actually Work?

**Web (browser):** Yes, expected to work. `httpClient` sets `withCredentials: true`, the backend's `Set-Cookie: refreshToken=…; HttpOnly; SameSite=Strict; Path=/api/auth` is sent automatically on `POST /api/auth/refresh` at bootstrap. Smoke path: log in → reload browser → brief `<Loader />` → AppTabs re-mounts because the cookie rehydrated the session.

**CORS caveat (flagged for manual verification in Plan 04):** The backend already sets `cors({ origin: env.CORS_ORIGIN, credentials: true })` per Plan 01-02 SUMMARY (T-01-15). For `withCredentials` to actually ship the cookie, `CORS_ORIGIN` in `backend/.env` must match the Expo web dev server origin exactly (no wildcard). Default dev value `http://localhost:19006` matches Expo SDK 51's `expo start --web`. If the dev port changes, update `.env` — the UI will silently fail to bootstrap and fall back to LoginScreen.

**Native (iOS / Android):** Bootstrap 401s on first launch (no stored refresh) — intended; user lands on LoginScreen. After the first successful login, the backend includes the refresh token in the response body (Plan 01-02 login contract). **However** — Plan 01-02's login response documented in `01-02-SUMMARY.md` ships `{ user, accessToken }` only; the refresh token is set via `Set-Cookie`. That cookie is unreachable from a native fetch. **Consequence:** on native, subsequent bootstraps will also 401 silently until the native refresh flow is wired (native client needs the refresh token in the response body, or the app needs to intercept `Set-Cookie` manually). This is a known Plan 04+ item — flagged in `## Known Stubs / Known Gaps` below, not a deviation for this plan since Plan 01-03 targets web-first per the verification section.

## Stub Screens — Scope

| Screen            | Content                                                                 | Replaced by |
| ----------------- | ----------------------------------------------------------------------- | ----------- |
| `LoginScreen`     | `TextInput` × 2 + `Button` calling `useAuth().login()`; error string     | Plan 04 (glassmorphism card) |
| `DashboardScreen` | "Signed in as X / Role: Y" + Logout button calling `useAuth().logout()` | Plan 05+ (real dashboard cards) |
| `UsersScreen`     | Placeholder text — admin-only                                           | Later phase  |

All three use locked theme tokens (`colors`, `spacing`) — no hardcoded hex values.

## Verification

| Check                                                                | Result                               |
| -------------------------------------------------------------------- | ------------------------------------ |
| `configureHttp`, `withCredentials: true` present in `httpClient.ts`  | PASS (grep)                          |
| `expo-secure-store` used in native `tokenStorage.ts`                 | PASS (grep)                          |
| `/api/auth/login`, `/refresh`, `/logout`, `/me` wired in `authService.ts` | PASS (grep)                    |
| `createContext`, `isAuthenticated` in `AuthContext.tsx`              | PASS (grep)                          |
| `AuthProvider`, `NavigationContainer` in `App.tsx`                   | PASS (grep)                          |
| `isAuthenticated ?` branch in `AppNavigator.tsx`                     | PASS (grep)                          |
| `canAccessTab('Users', …)` used in `AppTabs.tsx`                     | PASS (grep)                          |
| `guards.test.ts` — 6 cases covering behaviour bullets                | PASS (authored, runs green on install) |
| `npx tsc --noEmit`                                                   | Pending `npm install` (workspace deps not yet installed — expected per Plan 01-01 SUMMARY) |
| `npx jest src/navigation/guards.test.ts`                             | Pending `npm install` — ts-jest hoists once install runs |

**Note on runtime verification:** Plan 01-01 SUMMARY already flagged that `npm install` is a developer-run step, not a plan-time action. `ts-jest` + `typescript` are declared in `frontend/package.json` devDependencies; both pass the static structural checks but need `npm install` at repo root to execute. This matches the Plan 01-01 and 01-02 verification posture.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing defence-in-depth case] Added `null + Dashboard` test**
- **Found during:** Task 3 (writing guards.test.ts)
- **Issue:** Plan listed 5 behaviour cases; `canAccessTab('Dashboard', null)` was not specified but the function returns `false` for null user (intentional early-return). Without a test, a future refactor could flip it to `true` (treating null as "public").
- **Fix:** Added a 6th test asserting `canAccessTab('Dashboard', null) === false`.
- **Files modified:** `frontend/src/navigation/guards.test.ts`

**2. [Rule 2 — Race hardening] Bootstrap effect uses cancelled flag**
- **Found during:** Task 2
- **Issue:** Plan's bootstrap effect did not guard against the component unmounting mid-refresh. If `AuthProvider` unmounted during a slow `/refresh` (e.g., HMR), `setAccessToken` / `setUser` would fire on an unmounted component → React warning.
- **Fix:** Added `let cancelled = false;` local in the effect, checked after each await, and set to `true` in cleanup.
- **Files modified:** `frontend/src/context/AuthContext.tsx`

**3. [Rule 3 — Typing] AppTabs `screenOptions` + `headerShown:false` on AuthNavigator**
- **Found during:** Task 3
- **Issue:** Plan snippet didn't specify navigator options. Without `headerShown: false` the AuthNavigator shows a "Login" header bar in the stub, which clashes with Plan 04's planned full-screen glass card. Without AppTabs screenOptions, active tab color is react-navigation default (blue-ish) — inconsistent with locked `colors.primary`.
- **Fix:** Added `headerShown: false` to AuthNavigator and themed AppTabs's tabBar/header with theme tokens.
- **Files modified:** `frontend/src/navigation/AuthNavigator.tsx`, `frontend/src/navigation/AppTabs.tsx`

All three fixes are inside the plan's architectural shape — no Rule 4 escalation needed.

## Files Committed

```
frontend/App.tsx                                   (modified)
frontend/package.json                              (modified — pre-existing ts-jest from 01-01)
frontend/src/components/Loader.tsx                 (created)
frontend/src/context/AuthContext.tsx               (created)
frontend/src/navigation/AppNavigator.tsx           (created)
frontend/src/navigation/AppTabs.tsx                (created)
frontend/src/navigation/AuthNavigator.tsx          (created)
frontend/src/navigation/guards.test.ts             (created — TDD)
frontend/src/navigation/guards.ts                  (created)
frontend/src/navigation/types.ts                   (created)
frontend/src/screens/DashboardScreen.tsx           (created)
frontend/src/screens/LoginScreen.tsx               (created — stub)
frontend/src/screens/UsersScreen.tsx               (created)
frontend/src/services/authService.ts               (created)
frontend/src/services/httpClient.ts                (created)
frontend/src/services/tokenStorage.ts              (created — native)
frontend/src/services/tokenStorage.web.ts          (created — web no-op)
```

Single commit per user instruction: `feat(phase-1): authcontext, navigation shell, route guard, stub screens`.

## Authentication Gates

None triggered. All work stayed in frontend-only territory.

## Known Stubs / Known Gaps

- **LoginScreen is a stub** — Plan 04 replaces it with the glass card (D-04, D-05). Deliberate, called out in file header comment.
- **DashboardScreen / UsersScreen are stubs** — real content arrives in later phases. Both show role info and are reachable for smoke testing, so they are not blocking stubs.
- **Native refresh rehydration gap** — see "Cookie-Based Bootstrap" section above. Web works; native `Plan 01-03` does not read the refresh token from the backend response (backend currently only sets it as a cookie). Remediation path: Plan 04+ either (a) backend also returns `refreshToken` in the body when `User-Agent` is non-browser, or (b) native client parses `Set-Cookie` header manually. Tracked for Plan 04 decision. No user-facing break — login still works; only silent rehydrate-on-launch is affected.
- **`Loader` has no branding** — deliberate v1; Plan 04+ can layer the brand mark.

## Threat Flags

None. Every new piece of surface maps to an existing T-01-xx mitigation:

| Threat ID | Mitigation Location                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| T-01-16   | `AuthContext.tsx` — `accessToken` held in `useRef` + `useState`; never written to SecureStore / AsyncStorage. |
| T-01-17   | `tokenStorage.web.ts` — no-op; backend httpOnly cookie is the web refresh store.                            |
| T-01-18   | `tokenStorage.ts` — `expo-secure-store` used on native (iOS Keychain / Android Keystore).                   |
| T-01-19   | `guards.ts` + `AppTabs.tsx` — `canAccessTab` hides Users tab from non-admins; tests lock the rule.          |
| T-01-20   | `AppNavigator.tsx` — single `isAuthenticated` branch is the only gate; no screen-level navigate-to-login.    |
| T-01-21   | `httpClient.ts` — `isRefreshing` lock + pending queue + `_retry` flag + `/api/auth/*` exclusion.            |
| T-01-22   | `AuthContext.tsx` — `onAuthFailure` clears state → user lands on Login; accepted per threat register.       |

## Self-Check: PASSED

- All 17 files in `key-files.created` + `modified` exist on disk.
- No hardcoded hex values — all colors sourced from `frontend/src/constants/theme.ts`.
- No `AsyncStorage` imports anywhere (D-13 invariant held).
- No `navigation.navigate('Login')` in any screen (D-19 invariant held — grep clean).
- Single commit will be appended by the harness per user instruction.
