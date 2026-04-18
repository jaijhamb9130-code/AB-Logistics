---
phase: 02-user-management
addendum-to: 02-03-users-frontend-edit-deactivate
subsystem: users-activate-reactivation
tags: [frontend, backend, react-native, users, activate, reactivation, confirm-dialog, tdd, gap-closure]
scope: gap-closure
gap-source: human-UAT observation — "once a user is deactivated there is no way to bring them back"
requires:
  - 02-01-users-backend-crud (userModel.setActive, admin-only router guard)
  - 02-03-users-frontend-edit-deactivate (ConfirmDialog, usersController orchestrator pattern)
provides:
  - POST /api/users/:id/activate — backend endpoint that flips is_active → true while preserving the permissions column
  - userService.activate(id) — typed frontend wrapper
  - handleActivateConfirm / mapActivateError — controller orchestration + error copy
  - UsersScreen Activate row action (conditional render based on is_active) with green "Activate" pressable
  - ConfirmDialog variant prop ('danger' | 'default') — non-destructive confirm uses primary color
  - Permissions preservation invariant — reactivated users regain their full prior permission set
affects: [none-downstream — reuses Phase 2 surface only]
key-files:
  created:
    - .planning/phases/02-user-management/02-ACTIVATE-ADDENDUM.md (this file)
  modified:
    - backend/src/controllers/usersController.js (added exports.activate)
    - backend/src/routes/users.js (added POST /:id/activate route)
    - backend/tests/users.test.js (6 new cases under "users — POST /api/users/:id/activate")
    - frontend/src/services/userService.ts (added activate method)
    - frontend/src/screens/usersController.ts (handleActivateConfirm + mapActivateError + ActivateCallbacks)
    - frontend/src/screens/UsersScreen.tsx (activate state, conditional row render, Activate ConfirmDialog, activateAction style)
    - frontend/src/screens/UsersScreen.test.tsx (7 new ts-jest cases)
    - frontend/src/components/ConfirmDialog.tsx (added variant prop — 'danger' | 'default')
    - .planning/phases/02-user-management/02-HUMAN-UAT.md (added test #7, summary total 7 / pending 7)
duration: ~25m
completed: 2026-04-18
---

# Phase 2 Addendum: Activate (Reactivation) Flow — Summary

**Closes a usability gap surfaced in human UAT: a deactivated user had no way back into the system. This addendum adds an idempotent `POST /api/users/:id/activate` endpoint and a conditional green "Activate" row action on the Users screen. Permissions are fully preserved through deactivate → activate round-trips. 60/60 backend tests and 78/78 frontend tests green.**

## Scope

Gap-closure only. No new entities, no schema changes, no new threat surface beyond the plan-02-01 admin-only router.

The plan 02-03 UAT checklist now has 7 items (was 6). No other addendum is needed.

## Commits (this addendum)

1. **Backend RED** — `f37a227` — `test(02): add failing tests for POST /api/users/:id/activate (RED)`
2. **Backend GREEN** — `8127f09` — `feat(02): POST /api/users/:id/activate reactivates user with preserved permissions (GREEN)`
3. **Frontend RED** — `1a03f81` — `test(02): add failing tests for user reactivation UI (RED)`
4. **Frontend GREEN** — `410c451` — `feat(02): activate button restores deactivated user with prior permissions (GREEN)`
5. **Docs** — `(next commit)` — `docs(02): activate flow addendum`

## Test Counts

- **Backend:** 60/60 passing (6 new cases in `users.test.js` covering: 200 happy path + permissions preservation, idempotent 200 on already-active, 404 on unknown id, 400 invalid_id, 403 staff forbidden, 401 missing bearer)
- **Frontend:** 78/78 passing (7 new ts-jest cases in `UsersScreen.test.tsx` covering: handleActivateConfirm happy path, permissions preservation, 404 user_not_found + reloadList, generic failure, mapActivateError coverage, userService.activate presence)
- **Deltas from plan 02-03:** backend +6, frontend +7

## Permissions Preservation Invariant

**Statement:** Deactivating then reactivating a user MUST NOT alter the user's `permissions` column. The sanitized row returned by `POST /api/users/:id/activate` carries the exact permission set the user had before deactivate.

**Why it holds:**

- `userModel.setActive(id, flag)` writes ONLY the `is_active` column (and `updated_at`). The `permissions` column is never in the UPDATE's SET clause.
- `exports.activate` in `backend/src/controllers/usersController.js` calls `setActive(id, true)` and then re-selects the row via `findById(id)` → passes through `sanitizeUser(row)` → returns. No mutation of permissions anywhere on this path.
- Backend test `users — POST /api/users/:id/activate > 200 flips is_active to 1 and returns sanitized row with preserved permissions` asserts: `expect(res.body.permissions).toEqual(['bilty.read', 'freight.read'])` — the exact pre-deactivate permission set.
- Frontend test `handleActivateConfirm — permissions preservation` asserts: `replaced.permissions` equals the pre-deactivate permissions array. The UI swaps the server-returned row into the table in place; no permission editing happens on the activate path.

**Consequence:** The reactivated user can log in immediately with the same role + permissions they had before deactivation. No re-granting required.

## Files Touched

### Backend
- `backend/src/controllers/usersController.js` — New `exports.activate` handler. Structure mirrors `exports.deactivate` with ONE intentional divergence: no self-lockout guard (an inactive admin cannot be authenticated, so `req.user` can never be the target of an activate call from their own token).
- `backend/src/routes/users.js` — Added `router.post('/:id/activate', ctrl.activate);` under the admin-only router guard.
- `backend/tests/users.test.js` — Added `describe('users — POST /api/users/:id/activate')` block with 6 cases.

### Frontend
- `frontend/src/services/userService.ts` — Added `activate(id: number): Promise<UserListItem>` wrapper around `POST /api/users/:id/activate`.
- `frontend/src/screens/usersController.ts` — Added `ActivateCallbacks` interface, `handleActivateConfirm()` orchestrator (no self-lockout guard), `mapActivateError()` error-code → user-copy table.
- `frontend/src/screens/UsersScreen.tsx` — Added `activateTarget` + `activating` state, `openActivate()` + `onActivateConfirm()` handlers, conditional row action render (`r.is_active ? Deactivate : Activate`), dedicated Activate ConfirmDialog (non-destructive variant), `activateAction` style using `colors.success`.
- `frontend/src/screens/UsersScreen.test.tsx` — Added 7 ts-jest cases (see Test Counts).
- `frontend/src/components/ConfirmDialog.tsx` — Added `variant?: 'danger' | 'default'` prop. Precedence: `variant` wins over `danger` when both are supplied; `variant` omitted falls back to the `danger` boolean for plan-02-03 backwards compat.

### Docs / UAT
- `.planning/phases/02-user-management/02-HUMAN-UAT.md` — Added test row #7 ("Smoke — Activate flow restores access"); Summary totals updated (total 7, pending 7).

## Error-Code → User-Copy Mapping (activate)

| Server code      | HTTP | User copy                                        | Side effect     |
|------------------|------|--------------------------------------------------|-----------------|
| `user_not_found` | 404  | "User not found — refreshing list."              | reloadList()    |
| _(any other)_    | —    | "Could not activate user. Try again."            | none            |

Deliberately simpler than the deactivate table — there's no self-lockout case to map (an inactive admin cannot be signed in to issue the request).

## Deviations from Addendum Plan

None. The plan described the flow exactly and the established plan-02-03 patterns (`handleDeactivateConfirm` shape, in-place row replacement, Alert.alert for one-shot confirm errors, ConfirmDialog composition) dropped in cleanly.

One minor tactical choice worth noting: the ConfirmDialog `variant` prop was added in a **backwards-compatible** way rather than replacing `danger`. Rationale: plan 02-03's Deactivate dialog still uses `danger`, so flipping all callers to `variant` would be unnecessary churn. Precedence is documented in the component's JSDoc (`variant` wins when both supplied; `danger` boolean is the fallback when `variant` is omitted).

## Verification

| Check | Result |
|-------|--------|
| `cd backend && npx jest --no-coverage` | **60/60 passing** |
| `cd frontend && npx jest --no-coverage` | **78/78 passing** (4 suites) |
| `grep "setActive.*true" backend/src/controllers/usersController.js` | PASS (line 228) |
| `grep "permissions" backend/tests/users.test.js` under activate block | PASS (assertion asserts preserved perms) |
| `grep "userService.activate" frontend/src/screens/usersController.ts` | PASS |
| `grep "is_active ?" frontend/src/screens/UsersScreen.tsx` (conditional render) | PASS |
| `grep "variant" frontend/src/components/ConfirmDialog.tsx` | PASS (prop + precedence logic) |
| Zero hardcoded hex in new code paths | PASS (activate uses `colors.success`) |

## Next Steps

Phase 2 closes with this addendum. Ready for Phase 3. The patterns shipped here — idempotent status flip endpoint + conditional row action + ConfirmDialog variant — generalise to any future "soft delete / restore" flow (e.g., bilty archive, freight void).
