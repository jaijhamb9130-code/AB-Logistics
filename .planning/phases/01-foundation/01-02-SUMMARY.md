---
phase: 01-foundation
plan: 02
subsystem: auth-backend
tags: [auth, jwt, bcrypt, mysql, middleware, rate-limit, seed]
requires:
  - Plan 01-01 scaffold (backend/src/{index,app,config/env}.js, shared types)
provides:
  - MySQL users table (id, username unique, password_hash, role enum, permissions JSON, is_active)
  - MySQL connection pool (mysql2/promise, 10 connections, named placeholders)
  - userModel with findByUsername / findById / create
  - JWT utils (signAccessToken 15m, signRefreshToken 7d, verify*)
  - Password utils (bcrypt rounds=10 hash + compare)
  - authMiddleware (Bearer token -> req.user)
  - roleMiddleware (requireRole, requirePermission; admin + '*' wildcard)
  - loginLimiter (10 requests / 15 min per IP)
  - authController (login, refresh, logout, me)
  - Express router mounted at /api/auth
  - init-db and seed-admin scripts
  - 28 Jest tests (12 utils + 16 auth) — all green, no live MySQL
affects: [plan-01-03-frontend-auth, plan-01-04-login-screen, all-protected-endpoints]
tech-stack:
  added:
    - jest ^29.7.0 (dev)
    - supertest ^7.0.0 (dev)
  patterns:
    - Thin model layer (userModel) over mysql2 — controllers never call pool directly
    - Sanitization centralised in authController.sanitizeUser (strips password_hash)
    - Single bcrypt callsite (src/utils/password.js) per threat model T-01-06
    - Single JWT callsite (src/utils/jwt.js) per threat model T-01-08
    - Explicit MemoryStore for loginLimiter — enables deterministic test reset
    - app.js (exports express app) / index.js (calls listen) split for testability
key-files:
  created:
    - backend/src/db/pool.js
    - backend/src/db/schema.sql
    - backend/src/models/userModel.js
    - backend/src/utils/jwt.js
    - backend/src/utils/password.js
    - backend/src/middleware/authMiddleware.js
    - backend/src/middleware/roleMiddleware.js
    - backend/src/middleware/rateLimit.js
    - backend/src/controllers/authController.js
    - backend/src/routes/auth.js
    - backend/src/app.js
    - backend/scripts/init-db.js
    - backend/scripts/seed-admin.js
    - backend/tests/utils.test.js
    - backend/tests/auth.test.js
  modified:
    - backend/src/index.js (now re-exports from app.js and calls listen)
    - backend/package.json (added jest/supertest devDeps, test + init:db scripts)
decisions:
  - "Login rate-limit uses an explicit MemoryStore (exported as resetLoginLimiter) so tests can reset state deterministically between describe blocks in a single Jest file."
  - "authMiddleware performs a DB lookup on every protected request so disabling a user via is_active=0 takes effect immediately — no token revocation list needed."
  - "requirePermission grants admins implicit pass-through in addition to '*' wildcard; avoids having to pre-populate admin permissions array."
  - "Generic `invalid_credentials` returned for both unknown-user and bad-password (T-01-12 mitigation — no user enumeration)."
  - "Refresh cookie scoped to Path=/api/auth (not /) so it is only sent on auth endpoints, shrinking CSRF blast radius."
  - "Internal test route /api/auth/_admin-only-test kept alongside real endpoints so roleMiddleware is exercised without spinning up a mock express app in the test."
metrics:
  tasks_completed: 3
  commits: 1
  duration: "~30m"
  completed: 2026-04-18
  tests_total: 28
  tests_passing: 28
requirements:
  - BE-04
  - BE-05
---

# Phase 1 Plan 02: JWT Auth Backend — Summary

Delivered the security boundary the rest of the app depends on. A MySQL `users` table, bcrypt-hashed passwords, JWT access + refresh tokens with an httpOnly refresh cookie, IP-based rate limiting on login, role/permission guards, and a seed script that bootstraps the first admin. All 28 Jest tests pass without requiring a live MySQL.

## Endpoint Contracts (for Plan 01-03 frontend)

### `POST /api/auth/login`
Request:
```json
{ "username": "admin", "password": "hunter2" }
```
Responses:
- **200** — valid credentials, user active:
  ```json
  {
    "user": {
      "id": 1,
      "username": "admin",
      "role": "admin",
      "permissions": ["*"],
      "is_active": true,
      "created_at": "2026-04-18T..."
    },
    "accessToken": "<jwt>"
  }
  ```
  plus `Set-Cookie: refreshToken=<jwt>; HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=604800; Secure` (Secure only in production).
- **400** `{ "error": "invalid_body" }` — missing/non-string username or password.
- **401** `{ "error": "invalid_credentials" }` — unknown user OR wrong password (same response, no enumeration).
- **403** `{ "error": "account_disabled" }` — user exists and password matches but `is_active = 0`.
- **429** `{ "error": "too_many_requests" }` — >10 attempts in 15 min from the same IP.

### `POST /api/auth/refresh`
Reads `refreshToken` cookie (no body needed).
- **200** `{ "accessToken": "<new-jwt>" }`
- **401** `{ "error": "missing_refresh_token" }` — no cookie.
- **401** `{ "error": "invalid_refresh_token" }` — bad signature, expired, user not found, or user disabled.

### `POST /api/auth/logout`
Always **204 No Content**, clears refresh cookie via `Set-Cookie: refreshToken=; Path=/api/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT`.

### `GET /api/auth/me`
Requires `Authorization: Bearer <accessToken>`.
- **200** sanitized user object (same shape as `login.user`).
- **401** `{ "error": "missing_token" }` — no bearer.
- **401** `{ "error": "invalid_token" }` — bad/expired JWT, or user no longer exists / disabled.

## Cookie Settings Used

| Attribute | Value                                                  |
| --------- | ------------------------------------------------------ |
| Name      | `refreshToken`                                         |
| HttpOnly  | `true`                                                 |
| SameSite  | `Strict`                                               |
| Secure    | `true` in production, `false` in dev (`NODE_ENV` gate) |
| Path      | `/api/auth` (scoped — not sent on other routes)        |
| Max-Age   | `604800` seconds (7 days, matches JWT TTL)             |

## JWT Payloads

Access token (15m):
```json
{ "sub": <userId>, "role": "admin" | "staff", "iat": ..., "exp": ... }
```
Refresh token (7d):
```json
{ "sub": <userId>, "typ": "refresh", "iat": ..., "exp": ... }
```
Signed with `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` respectively (separate secrets — an access token cannot be verified with the refresh secret).

## Seeded Admin Credentials Format

Running `npm --prefix backend run seed:admin` prints exactly this block to stdout (used by Plan 01-04 smoke test):

```
================ AB LOGISTICS — ADMIN SEEDED ================
 username: admin
 password: <12-char base64url, OR the value of SEED_ADMIN_PASSWORD env var>
 user id : <number>
 CHANGE THIS PASSWORD AFTER FIRST LOGIN.
=============================================================
```

Re-running is idempotent — if an `admin` row already exists, the script logs
`[seed-admin] admin user already exists — skipping. Id: <n>` and exits 0.

## Role / Permission Rules (D-16, BE-05)

- `requireRole('admin')` — 401 if unauthenticated, 403 if role not in allowlist.
- `requirePermission('bilty.edit')` — 401 if unauthenticated. Passes if:
  1. user.role === 'admin' (admins bypass permission checks), or
  2. user.permissions includes `'*'` (wildcard), or
  3. user.permissions includes the exact permission string.
  Else 403.
- `permissions` column is `JSON NOT NULL`. The controller / middleware tolerate both already-parsed arrays (MySQL auto-parses JSON) and stringified arrays (defensive).

## Rate Limit Policy

| Endpoint          | Window    | Max Requests | Response on Exceed                                                |
| ----------------- | --------- | ------------ | ----------------------------------------------------------------- |
| `POST /api/auth/login` | 15 minutes | 10          | 429 `{ "error": "too_many_requests" }` + `RateLimit-*` headers |

Backed by `express-rate-limit` v7 with an explicit in-process MemoryStore — sufficient for v1 single-instance deployment. Multi-instance would need a shared store (Redis) — deferred to v2.

## Verification

- `npm --prefix backend test` → **28 tests passed** (2 suites, 1.5s):
  - `tests/utils.test.js`: 12 tests — password hash/compare, JWT sign/verify, secret isolation, userModel row shaping.
  - `tests/auth.test.js`: 16 tests — login happy/sad paths, refresh, logout, authMiddleware, roleMiddleware, rate limit.
- Static plan verification (Task 3): `seed-admin.js` contains `hashPassword` + `'admin'`; `package.json` has `seed:admin` and `init:db` scripts — **PASS**.
- Runtime DB-touching verification (`init:db`, `seed:admin`, manual curl) requires a live MySQL + env. Not run in this plan — Plan 01-04 covers end-to-end login flow.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] express-rate-limit v7 does not expose `.store.resetAll`**
- **Found during:** Task 2
- **Issue:** Rate-limit test (11th request → 429) failed because counter state from earlier login tests in the same file leaked in. The plan showed `exports.loginLimiter = rateLimit({ ... })` without a store handle, and v7 omits `store` from the returned function.
- **Fix:** Imported `MemoryStore` explicitly, constructed it, and passed `{ store: loginStore }` to `rateLimit()`. Exposed `resetLoginLimiter()` that calls `loginStore.resetAll()`. `beforeEach` calls it.
- **Files modified:** `backend/src/middleware/rateLimit.js`, `backend/tests/auth.test.js`
- **Threat impact:** None — T-01-07 mitigation (10/15min) is unchanged; only the test-only reset hook is new.

**2. [Rule 2 — Missing critical functionality] Generic `invalid_credentials` for unknown user**
- **Found during:** Task 2 (threat model T-01-12)
- **Issue:** Plan specified 401 for wrong password but did not explicitly call out behaviour for unknown user. Returning `user_not_found` vs `invalid_credentials` would enable user enumeration.
- **Fix:** authController.login returns `{ error: 'invalid_credentials' }` for both null-user and bad-password cases. Test coverage added.
- **Files modified:** `backend/src/controllers/authController.js`, `backend/tests/auth.test.js`

**3. [Rule 2] Permission check defensively parses JSON string**
- **Found during:** Task 2
- **Issue:** `mysql2` returns JSON columns already parsed when the driver supports it, but some configurations / older mysql versions return strings. Without defensive parsing, `perms.includes('...')` would throw or always return false.
- **Fix:** `roleMiddleware.js` and `authController.js` both call a `normalizePerms / parsePerms` helper that accepts Array, JSON-string, or missing values.
- **Files modified:** `backend/src/middleware/roleMiddleware.js`, `backend/src/controllers/authController.js`

**4. [Rule 2] authMiddleware revokes sessions for disabled users immediately**
- **Found during:** Task 2
- **Issue:** Plan only said "attach req.user". If an admin disables a user mid-session, the staff token would still work until 15-min expiry — a real security gap.
- **Fix:** authMiddleware re-queries the DB and returns 401 if `!user.is_active`. Adds one SELECT per protected request — acceptable cost for immediate revocation on disable.
- **Files modified:** `backend/src/middleware/authMiddleware.js`

**5. [Rule 2] Internal admin-only test route for roleMiddleware coverage**
- **Found during:** Task 2
- **Issue:** Plan describes `roleMiddleware` but no real admin-only endpoint exists yet. Tests cannot cover it without either (a) a second test-only app, or (b) a dedicated internal route.
- **Fix:** Added `GET /api/auth/_admin-only-test` under the auth router, guarded by `authMw + requireRole('admin')`. Returns `{ ok: true }`. Underscore-prefixed so it's clearly internal; no threat-model surface added because it requires admin auth.
- **Files modified:** `backend/src/routes/auth.js`

No architectural changes — all fixes are within the existing plan shape.

## Authentication Gates

None triggered. All tests use mocked `userModel` + `pool`; no live DB required.

## Threat Model Deviations

None. Every threat ID T-01-06 through T-01-15 has its mitigation in place:

| Threat ID | Mitigation Location                                                                |
| --------- | ---------------------------------------------------------------------------------- |
| T-01-06   | `src/utils/password.js` is the only bcrypt callsite; `userModel.findById` excludes `password_hash` from SELECT. |
| T-01-07   | `src/middleware/rateLimit.js` — 10 req / 15 min.                                   |
| T-01-08   | `src/utils/jwt.js` — secrets from env only, 15m access TTL.                        |
| T-01-09   | `src/controllers/authController.js` refreshCookieOptions — httpOnly, sameSite=strict, path=/api/auth, secure-in-prod. |
| T-01-10   | `src/middleware/roleMiddleware.js` requireRole + /_admin-only-test route exercised by tests. |
| T-01-11   | Accepted — console.error for failed logins (no structured audit log in v1).        |
| T-01-12   | `authController.login` returns `invalid_credentials` generically.                  |
| T-01-13   | Accepted — single secret per env var in v1.                                        |
| T-01-14   | `src/db/pool.js` — connectionLimit=10, waitForConnections=true.                    |
| T-01-15   | `src/app.js` — `cors({ origin: env.CORS_ORIGIN, credentials: true })`.             |

## Known Stubs

- No frontend consumer yet — `POST /api/auth/login` is reachable via curl / tests only. Plan 01-03 (AuthContext) and Plan 01-04 (LoginScreen) wire it up.
- `SEED_ADMIN_PASSWORD` is unset in `.env.example` — seed generates a random one. Intentional for first boot; ops can set it for controlled environments.
- No protected application endpoint besides `/api/auth/me` and `/_admin-only-test` — feature endpoints arrive in later plans (BE-06 onward).

All stubs are plan-boundary stubs, documented in the roadmap.

## Threat Flags

None. No new surface outside the plan's `<threat_model>` block was added — the internal `_admin-only-test` route is covered by the existing T-01-10 admin-only mitigation.

## Self-Check: PASSED

All files in `key-files.created` exist on disk. `jest` run green (28/28). Commit captured per user instruction.
