---
phase: 02-user-management
plan: 01
subsystem: users-backend-crud
tags: [backend, users, rbac, crud, permissions, self-lockout, tdd]
requires:
  - Plan 01-02 auth backend (authMw, requireRole, hashPassword, userModel baseline, users table)
provides:
  - Canonical permission vocabulary (backend/src/constants/permissions.js)
  - Shared DTOs — Permission, UserListItem, CreateUserRequest, UpdateUserRequest
  - Extended userModel (findAll, update, setActive, findByUsernameExcludingId; findById now selects updated_at)
  - Schema migration — idempotent ADD COLUMN users.updated_at
  - Admin-only /api/users CRUD (list, get, create, update, deactivate)
  - Self-lockout guard (409 self_lockout_forbidden)
  - 26 supertest cases covering auth, RBAC, validation, CRUD, self-lockout
affects: [plan-02-02-users-frontend-service, plan-02-03-users-ui, all-permission-gated-routes]
tech-stack:
  added: []
  patterns:
    - Canonical permission list as the single source of truth for both server validation and TypeScript types
    - Router-level authMw + requireRole('admin') — single gate, no per-route bypass risk
    - hashPassword is the only bcrypt callsite in the user lifecycle (T-01-06 / T-02-03)
    - Dynamic UPDATE via mysql2 named placeholders + allowed-key whitelist (T-02-09)
    - Idempotent DDL for the Phase-02 updated_at column (information_schema probe + PREPARE/EXECUTE)
    - sanitizeUser walker-helper in tests asserts password_hash is absent everywhere
key-files:
  created:
    - backend/src/constants/permissions.js
    - backend/src/controllers/usersController.js
    - backend/src/routes/users.js
    - backend/tests/users.test.js
  modified:
    - backend/src/db/schema.sql
    - backend/src/models/userModel.js
    - backend/src/app.js
    - shared/types/user.ts
decisions:
  - sanitizeUser + parsePerms are replicated locally in usersController (not extracted to a shared util yet) — keeps Plan 02-01 scope tight; file-header comment flags the future refactor.
  - Self-lockout guard runs BEFORE any DB write, so userModel.setActive is never called for self-targeting requests — asserted by test.
  - 400 invalid_body is returned for both "no fields at all" (create) and "empty patch object" (update); more specific field codes (invalid_username / invalid_password / invalid_role / invalid_permissions) take precedence when a field IS supplied but malformed.
  - Username uniqueness on PATCH is checked via findByUsernameExcludingId BEFORE issuing UPDATE — eliminates the race vs. relying on a unique-constraint violation at INSERT time.
  - findById now always returns updated_at — downstream consumers can rely on its presence from Phase 2 forward.
metrics:
  tasks_completed: 2
  commits: 3
  duration: "~15m"
  completed: 2026-04-18
  tests_total: 54
  tests_passing: 54
  tests_added: 26
requirements:
  - USER-01
  - USER-02
  - USER-03
  - USER-04
  - USER-05
---

# Phase 2 Plan 01: User Management Backend — Summary

Shipped admin-only CRUD on top of the Phase-1 auth layer. Five endpoints under `/api/users`, guarded at the router level, validated against a canonical permission vocabulary shared with the frontend, and hardened with a self-lockout guard that prevents an admin from disabling their own account. All 54 backend tests pass — 28 from Phase 1 plus 26 new tests covering every behaviour bullet in the plan.

## Endpoint Contracts

All routes require `Authorization: Bearer <adminAccessToken>`. Unauthenticated requests → `401 missing_token`. Non-admin JWT → `403 forbidden`.

### `GET /api/users`
Returns all users.
- **200** — `UserListItem[]` sorted by id ascending. Each element:
  ```json
  {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "permissions": ["*"],
    "is_active": true,
    "created_at": "2026-04-18T07:42:11.000Z",
    "updated_at": "2026-04-18T07:42:11.000Z"
  }
  ```

### `GET /api/users/:id`
- **200** — single sanitized user (same shape as list element).
- **400** `{ "error": "invalid_id" }` — non-numeric / non-positive id in URL.
- **404** `{ "error": "user_not_found" }` — unknown id.

### `POST /api/users`
Request:
```json
{
  "username": "joe",
  "password": "correct-horse",
  "role": "staff",
  "permissions": ["bilty.read", "freight.read"]
}
```
- **201** — created user (sanitized). `hashPassword` is called exactly once; the plain password never hits the DB.
- **400** `{ "error": "invalid_body" }` — any of `username|password|role|permissions` missing or wrong type.
- **400** `{ "error": "invalid_username" }` — username fails `/^[a-zA-Z0-9_.-]{3,64}$/`.
- **400** `{ "error": "invalid_password" }` — password shorter than 8 chars.
- **400** `{ "error": "invalid_role" }` — role not in `{'admin','staff'}`.
- **400** `{ "error": "invalid_permissions" }` — any permission string not in canonical vocab and not `'*'`.
- **409** `{ "error": "username_taken" }` — another user already owns this username.

### `PATCH /api/users/:id`
Body accepts any subset of `{ username?, password?, role?, permissions? }`. Empty/no-field patch → 400 `invalid_body`.
- **200** — sanitized user after update.
- **400** — same field-level codes as `POST`, plus `invalid_id`, `invalid_body` (empty patch).
- **404** `{ "error": "user_not_found" }` — `UPDATE ... WHERE id = :id` affected 0 rows.
- **409** `{ "error": "username_taken" }` — new username already belongs to another id (checked before UPDATE via `findByUsernameExcludingId`).

If `password` is supplied it is hashed via `hashPassword` before the SQL UPDATE — `userModel.update` receives `password_hash`, never `password`.

### `POST /api/users/:id/deactivate`
Flips `is_active` to 0.
- **200** — sanitized user with `is_active: false`.
- **400** `{ "error": "invalid_id" }` — non-numeric id.
- **404** `{ "error": "user_not_found" }` — unknown id.
- **409** `{ "error": "self_lockout_forbidden" }` — `req.user.id === :id`. **`userModel.setActive` is NOT called** in this branch (asserted by test).

## Error Code Glossary

Frontend should pattern-match these exact strings (plan 02-02 / 02-03 will localize them into user-facing copy):

| Code | HTTP | Meaning |
|------|------|---------|
| `missing_token` | 401 | No `Authorization: Bearer ...` on a protected route |
| `invalid_token` | 401 | JWT bad/expired/user disabled |
| `forbidden` | 403 | Authenticated but not admin |
| `invalid_body` | 400 | Payload missing required fields or empty patch |
| `invalid_id` | 400 | `:id` path param not a positive integer |
| `invalid_username` | 400 | Fails `/^[a-zA-Z0-9_.-]{3,64}$/` |
| `invalid_password` | 400 | Shorter than 8 chars |
| `invalid_role` | 400 | Not in `{'admin','staff'}` |
| `invalid_permissions` | 400 | Contains an entry not in canonical vocab + `'*'` |
| `username_taken` | 409 | Unique-username collision |
| `user_not_found` | 404 | id has no matching row |
| `self_lockout_forbidden` | 409 | Admin tried to deactivate their own id |

## sanitizeUser Contract

```js
function sanitizeUser(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    permissions: parsePerms(row.permissions), // Array | JSON-string → Array
    is_active: Boolean(row.is_active),        // 0/1 → boolean
    created_at: row.created_at,
    updated_at: row.updated_at,               // undefined tolerated
  };
}
```
- Always strips `password_hash` by construction (destructured into `_p`).
- Coerces MySQL tinyint 0/1 to a proper boolean.
- Permissions tolerate both parsed-array and JSON-string (defensive — mirrors `roleMiddleware.normalizePerms`).

## Canonical Permission Vocabulary

Defined once in `backend/src/constants/permissions.js`; mirrored verbatim in `shared/types/user.ts::Permission`.

```
'bilty.read', 'bilty.edit',
'freight.read',
'order.read', 'order.edit',
'vehicle.read', 'vehicle.edit',
'report.read',
'*'  (wildcard)
```

Any value outside this list is rejected with `400 invalid_permissions` on both POST and PATCH. Admins bypass permission checks at request time (per Phase 1 roleMiddleware), but their stored `permissions` array is still validated on write so nothing unknown ever lands in the DB.

## Verification

| Check | Result |
|-------|--------|
| `npm --prefix backend test` | **54 passed / 0 failed** (3 suites) |
| `grep "app.use('/api/users'" backend/src/app.js` | PASS — line 33 |
| `grep "requireRole('admin')" backend/src/routes/users.js` | PASS — line 10 |
| `grep "self_lockout_forbidden" backend/src/controllers/usersController.js backend/tests/users.test.js` | PASS (controller + 2 test lines) |
| `grep "hashPassword" backend/src/controllers/usersController.js` | PASS — only bcrypt-producer referenced |
| Direct `bcrypt` import in controller | PASS — **0 occurrences** (T-01-06 invariant held) |
| `PERMISSIONS.includes('bilty.read')` + `isValidPermission('*')` | PASS |
| `userModel` exports 7 functions | PASS |
| `grep "updated_at" backend/src/db/schema.sql` | PASS |
| `grep "CreateUserRequest\|UpdateUserRequest\|UserListItem" shared/types/user.ts` | PASS (all 3 present) |

Runtime DB-touching verification (the idempotent `updated_at` migration) requires a live MySQL — same posture as Plan 01-02's schema.sql verification. Migration is purely additive and information_schema-guarded, so it is safe to run on an existing users table.

## Test Coverage Highlights (26 new tests)

- **Auth gates** — 5 tests × unauthenticated on every route + 1 sweep covering all 5 routes with a staff JWT → 403 forbidden.
- **List** — 200 returns array; `is_active` is a boolean; `assertNoPasswordHash(body)` walks the full body.
- **Get** — 200 / 404 / 400 invalid_id.
- **Create** — 201 happy path asserts `userModel.create` gets `password_hash: 'hashed(...)'`, NOT plain password, and no `password` key. Plus 400s for each field + 409 username_taken.
- **Update** — role update, password re-hash path (mock `hashPassword` assertion), 404 on zero rows, 409 username clash, 400 for invalid permissions / role, 400 empty patch.
- **Deactivate** — 200 flips to false, 404 on unknown id.
- **Self-lockout** — admin deactivating own id → 409 `self_lockout_forbidden`; `userModel.setActive.not.toHaveBeenCalled()`.

Total assertions: **63 `expect()` calls** across 26 tests (plan required ≥18).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical validation case] `PATCH` with empty body returns `invalid_body`**
- **Found during:** Task 2 (writing tests)
- **Issue:** Plan action block described validators for each field but did not specify the "no fields supplied at all" case. Without an early guard, the controller would issue a no-op `UPDATE SET WHERE id=:id` — which mysql2 rejects with a SQL parse error, leaking to the generic 500 handler.
- **Fix:** Added a leading check that returns 400 `invalid_body` if all four optional fields are `undefined`. Test case covers this.
- **Files modified:** `backend/src/controllers/usersController.js` + `backend/tests/users.test.js`

**2. [Rule 2 — Missing validation] `invalid_id` on `GET /api/users/:id` and `POST /:id/deactivate` for non-numeric id**
- **Found during:** Task 2
- **Issue:** Plan snippet for deactivate had an `invalid_id` check, but the `get` and `update` handlers did not. Without it, `SELECT ... WHERE id = :id` with `:id = NaN` returns 0 rows and the caller sees 404 — misleading and asymmetric with deactivate.
- **Fix:** `parseId(raw)` helper used by all three handlers. Test asserts `GET /api/users/abc → 400 invalid_id`.
- **Files modified:** `backend/src/controllers/usersController.js` + `backend/tests/users.test.js`

**3. [Rule 3 — Test infra] `hashPassword` must be jest-mocked so tests don't burn bcrypt CPU per case**
- **Found during:** Task 2 (RED phase)
- **Issue:** Without mocking `src/utils/password`, each create/update test would call real bcrypt (rounds=10 ≈ 100ms each) — the suite would cross 3s and slow CI. Plan didn't explicitly call this out but Phase 1's `auth.test.js` mocks the model for the same reason.
- **Fix:** `jest.mock('../src/utils/password', ...)` returns `hashPassword = async (p) => 'hashed(' + p + ')'`. Tests then assert the fake hash as the value passed to `userModel.create/update`, which is stronger than asserting "some bcrypt-ish string" anyway.
- **Files modified:** `backend/tests/users.test.js`

No architectural changes; no Rule 4 escalation needed.

## Authentication Gates

None triggered. Pure backend plan with mocked pool — no live DB, no auth interactions beyond issuing test JWTs.

## Threat Model Status

Every Phase-02 threat ID maps to an in-place mitigation; no Phase-01 invariants broken:

| Threat ID | Mitigation Location |
|-----------|---------------------|
| T-02-01 (E — Elevation) | `routes/users.js` line 10 — `router.use(authMw, requireRole('admin'))` before any handler |
| T-02-02 (I — Info disclosure) | `usersController.sanitizeUser` strips password_hash; `userModel.findAll/findById` never SELECT it; test walker asserts absence on every response |
| T-02-03 (T — Password tampering) | `hashPassword` is the only bcrypt callsite in the controller (direct `bcrypt` import count = 0); plain password never passed to `userModel.create/update` |
| T-02-04 (D — Self-lockout DoS) | `deactivate` handler early-returns 409 before `setActive`; test asserts `setActive.not.toHaveBeenCalled()` |
| T-02-05 (T — Permission injection) | `isValidPermissionArray` rejects anything outside canonical list ∪ `'*'`; enforced on both create and update |
| T-02-06 (I — Username enumeration) | Accepted — admin-only endpoint, admin already has LIST |
| T-02-07 (T — Arbitrary role) | `VALID_ROLES = ['admin','staff']` whitelist; 400 invalid_role otherwise |
| T-02-08 (S — Spoofing via cached JWT) | Inherits Phase 1 authMiddleware DB re-query — no code change here |
| T-02-09 (T — SQL injection) | `userModel.update` whitelists keys before building SET; mysql2 named placeholders only; no concat |

## Known Stubs

None. This is a closed back-end surface with tests on every happy path and every documented error branch. Frontend consumers (`userService`, Users screen) arrive in Plans 02-02 and 02-03 — no stubs in this plan are blocking either.

## Threat Flags

None. All new surface is inside the plan's `<threat_model>` block. The `updated_at` column is audit-friendly (not a trust boundary); the canonical permission constants live in a constants module (no network surface); no new CORS / cookie / rate-limit changes.

## Self-Check: PASSED

- All 4 files in `key-files.created` exist on disk:
  - `backend/src/constants/permissions.js` — FOUND
  - `backend/src/controllers/usersController.js` — FOUND
  - `backend/src/routes/users.js` — FOUND
  - `backend/tests/users.test.js` — FOUND
- All 4 files in `key-files.modified` updated:
  - `backend/src/db/schema.sql` — contains `updated_at` migration
  - `backend/src/models/userModel.js` — 7 exports
  - `backend/src/app.js` — mounts `/api/users`
  - `shared/types/user.ts` — Permission/UserListItem/CreateUserRequest/UpdateUserRequest added
- 3 task commits exist in git log:
  - `2b26a0c` — Task 1 permissions/model/schema/types
  - `b86e437` — Task 2 RED (failing tests)
  - `2735863` — Task 2 GREEN (controller + router + mount)
- Test suite: 54/54 passing (3 suites, Jest).
