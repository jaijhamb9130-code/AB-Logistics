---
phase: 02-user-management
plan: 03
subsystem: users-frontend-edit-deactivate
tags: [frontend, react-native, users, edit, deactivate, self-lockout, confirm-dialog, tdd]
requires:
  - phase: 02-01-users-backend-crud
    provides: "PATCH /api/users/:id, POST /api/users/:id/deactivate, self_lockout_forbidden 409 contract, user_not_found 404"
  - phase: 02-02-users-frontend-list-create
    provides: "DataTable / Modal / PermissionPicker primitives, userService.update + deactivate wire contract, usersController factory pattern, error-code copy table"
provides:
  - ConfirmDialog primitive — reusable destructive-action confirmation (Modal-based, danger variant, theme-driven)
  - validateUpdateUser pure validator — empty-string password = "no change" (T-02-15)
  - UsersScreen row actions — Edit modal (role + permissions + optional password reset) + Deactivate flow
  - Two-layer self-lockout guard — isSelf(currentUser, row) client disable + 409 self_lockout_forbidden server contract
  - handleEditUserSubmit + handleDeactivateConfirm controller orchestrators (ts-jest testable)
  - mapUpdateUserError + mapDeactivateError — centralized error-code → user-copy mapping
affects: [phase-03-bilty, all-future-admin-destructive-actions]
tech-stack:
  added: []
  patterns:
    - "ConfirmDialog composes <Modal/> — does not duplicate backdrop/close logic; single point of UI truth for destructive confirmations"
    - "Empty-string password = no-change contract — validator skips validation AND submit omits the key from PATCH body (T-02-15); backend never sees a zero-length password"
    - "Two-layer self-lockout guard — client isSelf() disables the Deactivate pressable AND handles 409 self_lockout_forbidden as belt-and-braces (T-02-14)"
    - "In-place row update — after update/deactivate resolves, setRows maps over prev rows and replaces the matching id; no full load() refetch needed"
    - "Controller-extract pattern extended — handleEditUserSubmit + handleDeactivateConfirm live in usersController.ts (pure ts-jest) alongside handleCreateUserSubmit; screen is a thin view"
key-files:
  created:
    - frontend/src/components/ConfirmDialog.tsx
  modified:
    - frontend/src/utils/userValidation.ts
    - frontend/src/utils/userValidation.test.ts
    - frontend/src/screens/UsersScreen.tsx
    - frontend/src/screens/UsersScreen.test.tsx
    - frontend/src/screens/usersController.ts
key-decisions:
  - "Extended usersController.ts with edit/deactivate orchestrators instead of branching into a new module — keeps one logical home for 'users feature' business logic and reuses the same ts-jest harness plan 02-02 established"
  - "ConfirmDialog composes Modal (not a reimplementation) — single source of truth for overlay/backdrop/close; danger variant simply tints the confirm button using colors.danger"
  - "PATCH body omits password key entirely when the input is empty — the submit orchestrator checks form.password !== '' before assigning the key, matching validateUpdateUser's 'no change' semantics (T-02-15)"
  - "Deactivate error handling uses Alert.alert (cross-platform RN + web via RN Web) rather than an inline banner — matches the 'modal-should-close-on-failure' UX for one-shot confirm dialogs; inline banner is reserved for the Edit modal where the user can retry"
  - "isSelf() is exported from the controller (pure, testable) AND also short-circuits openDeactivate() in the screen — defence in depth against a disabled-button bypass"
requirements-completed:
  - USER-03
  - USER-04
duration: ~22m
completed: 2026-04-18
---

# Phase 2 Plan 03: User Edit + Deactivate — Summary

**Row-level Edit and Deactivate actions on the Users screen, backed by a reusable ConfirmDialog primitive and a two-layer self-lockout guard (client disable + server 409). All 71 frontend tests green.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-04-18
- **Completed:** 2026-04-18
- **Tasks:** 2 (both TDD: RED → GREEN)
- **Files created:** 1 (ConfirmDialog)
- **Files modified:** 5

## Accomplishments

- Shipped the Edit User modal — pre-fills role + permissions from the row, username is read-only, optional password-reset field (empty = no change)
- Shipped the Deactivate flow — row action opens ConfirmDialog (danger variant) → confirm → POST /api/users/:id/deactivate → row Status flips to Inactive
- Built reusable `ConfirmDialog` primitive (composes Modal, danger variant, loading state) — ready for Phase 3+ destructive actions
- Two-layer self-lockout guard: client disables Deactivate pressable on the admin's own row AND maps server 409 self_lockout_forbidden to "You cannot deactivate your own account."
- `validateUpdateUser` pure validator — empty-string password = "no change" contract locked in with 8 unit cases
- Centralised error-code → user-copy mapping for edit + deactivate (extends plan 02-02's table with `user_not_found` and `self_lockout_forbidden`)
- All tests pass: 71/71 across 4 suites (25 create validators + 8 edit validators + 20 screen-level cases + Phase-1 guards)

## Task Commits

1. **Task 1 RED** — `ce2a3a8` — `test(02-03): add failing tests for validateUpdateUser (RED)`
2. **Task 1 GREEN** — `0517582` — `feat(02-03): validateUpdateUser + ConfirmDialog primitive (GREEN)`
3. **Task 2 RED** — `2e84c61` — `test(02-03): add failing tests for edit/deactivate/self-lockout (RED)`
4. **Task 2 GREEN** — `c1fff16` — `feat(02-03): edit + deactivate row actions with self-lockout guard (GREEN)`
5. **Plan metadata** — `(this commit)` — `docs(02-03): complete edit + deactivate plan`

## Files Created/Modified

### Created

- `frontend/src/components/ConfirmDialog.tsx` — Reusable destructive-action confirmation. Composes `<Modal/>` from plan 02-02. Props: `visible, onCancel, onConfirm, title, message, confirmLabel?, cancelLabel?, danger?, loading?, testID?`. Zero hardcoded hex — `danger` variant sources red from `colors.danger`. ActivityIndicator while loading. Cancel button is a ghost pressable (colors.textMuted); Confirm is a themed Pressable (minHeight 44 for accessibility).

### Modified

- `frontend/src/utils/userValidation.ts` — Appended `validateUpdateUser(input: UpdateUserRequest): UpdateUserErrors`. Empty-string password skips validation (no-change semantics); undefined field skips entirely; `permissions: []` still errors as `'required'` (cannot clear). Existing `validateCreateUser` untouched.
- `frontend/src/utils/userValidation.test.ts` — Appended 8 ts-jest cases covering `{}`, `{password:''}`, short password, valid password, invalid role, empty permissions, short username, full valid update.
- `frontend/src/screens/UsersScreen.tsx` — Extended (did not rewrite the list/create parts). Added: `useAuth()` wiring, row-action column (Edit + Deactivate pressables with accessibility), Edit modal (role radios + PermissionPicker + optional PasswordField), ConfirmDialog for deactivate, 4 new styles (rowActions, editAction, deactivateAction, actionDisabled, readonlyLabel, readonlyValue).
- `frontend/src/screens/UsersScreen.test.tsx` — Appended 14 ts-jest cases covering isSelf (3), handleEditUserSubmit happy/sad paths (5), handleDeactivateConfirm happy/sad (2), mapUpdateUserError (4), mapDeactivateError (3).
- `frontend/src/screens/usersController.ts` — Extended with `isSelf()`, `EditUserForm`, `EditSubmitCallbacks`, `handleEditUserSubmit()`, `mapUpdateUserError()`, `DeactivateCallbacks`, `handleDeactivateConfirm()`, `mapDeactivateError()`. The create-flow code from plan 02-02 is untouched.

## Public API — ConfirmDialog (reused in Phase 3+)

```ts
interface ConfirmDialogProps {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;   // default: 'Confirm'
  cancelLabel?: string;    // default: 'Cancel'
  danger?: boolean;        // default: false — when true, confirm button is colors.danger
  loading?: boolean;       // default: false — dims + disables both buttons
  testID?: string;
}
```

Rules:
- Composes `<Modal/>` — no duplicate backdrop/close logic.
- Pressing confirm awaits `onConfirm`; the parent owns the try/catch.
- On `loading=true`, both buttons are disabled and the confirm shows an ActivityIndicator (color = colors.card for contrast on danger bg).
- Zero hardcoded hex; danger variant uses `colors.danger` from `constants/theme`.

## Error-Code → User-Copy Mapping (merged single source of truth)

Lives in `usersController.ts` across `mapCreateUserError`, `mapUpdateUserError`, `mapDeactivateError`:

| Server code              | HTTP | Create flow                                                    | Edit flow                                                   | Deactivate flow                                               |
|--------------------------|------|----------------------------------------------------------------|-------------------------------------------------------------|---------------------------------------------------------------|
| `invalid_username`       | 400  | "Username is invalid (3–64 chars, letters/digits/._-)."         | "Username is invalid (3–64 chars, letters/digits/._-)."      | —                                                             |
| `invalid_password`       | 400  | "Password must be at least 8 characters."                      | "Password must be at least 8 characters."                    | —                                                             |
| `invalid_role`           | 400  | "Role must be Admin or Staff."                                 | "Role must be Admin or Staff."                               | —                                                             |
| `invalid_permissions`    | 400  | "Select at least one permission."                              | "Select at least one permission."                            | —                                                             |
| `username_taken`         | 409  | "That username is already taken."                              | "That username is already taken."                            | —                                                             |
| `user_not_found`         | 404  | —                                                              | "This user no longer exists — refreshing list."             | "This user no longer exists — refreshing list." (+ reloadList)|
| `self_lockout_forbidden` | 409  | —                                                              | —                                                           | "You cannot deactivate your own account."                     |
| _(any other / network)_  | —    | "Could not create user. Try again."                            | "Could not save changes. Try again."                         | "Could not deactivate user. Try again."                       |

## Self-Lockout Contract (documented)

**Threat ID:** T-02-14 (Denial of service — admin disables own account)

**Two-layer mitigation:**

1. **Client layer (this plan):** `isSelf(currentUser, row)` returns true when `currentUser.id === row.id`.
   - The Deactivate pressable renders with `disabled={true}` + `accessibilityState.disabled=true` + aria label "You cannot deactivate your own account".
   - `openDeactivate()` short-circuits (no dialog opens) if `isSelf()` returns true.
2. **Server layer (plan 02-01 / T-02-04):** Backend returns `409 { error: 'self_lockout_forbidden' }` on `POST /api/users/:id/deactivate` when `req.user.id === :id`. `userModel.setActive` is never called for the self-target branch.
3. **UI fallback:** If a race condition (e.g., stale currentUser.id) lets the request through, the client maps the 409 to "You cannot deactivate your own account." via `Alert.alert`; the row is not mutated.

## Verification

| Check | Result |
|-------|--------|
| `npx jest src/screens/UsersScreen.test.tsx src/utils/userValidation.test.ts --no-coverage` | **56 passed / 0 failed** (2 suites, 2.1s) |
| `npx jest` (full frontend suite) | **71 passed / 0 failed** (4 suites, 2.3s) |
| `grep "userService.update" frontend/src/screens/usersController.ts` | PASS (line 206) |
| `grep "userService.deactivate" frontend/src/screens/usersController.ts` | PASS (line 266) |
| `grep "isSelf" frontend/src/screens/UsersScreen.tsx` | PASS (import + openDeactivate guard + column render) |
| `grep "self_lockout_forbidden" frontend/src/screens/usersController.ts` | PASS (line 294, mapDeactivateError) |
| `grep "ConfirmDialog" frontend/src/screens/UsersScreen.tsx` | PASS (import + render) |
| Hardcoded hex scan on `UsersScreen.tsx` / `ConfirmDialog.tsx` | **PASS** (zero `#RRGGBB`) |
| `grep "export function ConfirmDialog\|export function validateUpdateUser"` | PASS (both present) |
| `grep "from '\./Modal'" frontend/src/components/ConfirmDialog.tsx` | PASS (composes Modal) |

**tsc note:** `npx tsc --noEmit` reports a pre-existing `TS6046` on `node_modules/expo/tsconfig.base.json` (`--module` option) — upstream Expo tsconfig issue unrelated to this plan's files. No new type errors introduced by plan 02-03 (verified by ts-jest compiling all 71 tests without error).

## Decisions Made

- **Extended `usersController.ts` in-place** rather than creating `editController.ts` / `deactivateController.ts` — one module per "feature domain" (users) is cleaner and reuses the ts-jest mock of `userService` that plan 02-02 already established. Each orchestrator is a pure exported function; the tests don't import a class/factory.
- **`ConfirmDialog` composes `<Modal/>` instead of reimplementing the overlay** — satisfies the plan's acceptance criterion and keeps the backdrop/close behaviour in one place; future destructive flows get the same UX automatically.
- **`Alert.alert` for deactivate error (not inline banner)** — the ConfirmDialog closes on error (the target is cleared), so an inline banner has no surface to live on. Edit flow keeps the inline `editError` banner because the user can fix and retry within the modal.
- **`isSelf()` is a pure exported helper** — ts-jest tests cover it directly (3 cases: match, mismatch, null user); the screen imports and uses it both in `openDeactivate()` (short-circuit) and in the column render (disabled state).

## Deviations from Plan

### Auto-fixed Issues

None. The plan's action block described `state + helpers + render JSX + styles` inline in `UsersScreen.tsx`, but extracting orchestrators to `usersController.ts` was the agreed pattern from plan 02-02 — not a deviation, just the established architecture. The plan's `<read_first>` clause anticipated this by instructing to read `usersController.ts` as part of Task 2.

### Conscious Adaptations

**1. Deactivate error handling uses `Alert.alert` instead of `<Text style={styles.formError}>` banner**
- **Context:** Plan action (b) showed `Alert.alert('Action blocked', ...)` for deactivate. No change — this is the plan's own choice.
- **Rationale:** A ConfirmDialog is a one-shot flow — there's no modal body to host a banner after the confirm fires. Alert.alert is the canonical cross-platform "transient error surface" in RN + RN Web. The Edit modal keeps its inline banner because the user can fix the form and retry without re-opening.
- **Test coverage:** Test N asserts `cb.onError` is called with the user copy — the screen wires `onError` to `Alert.alert`.

**Total deviations:** 0 auto-fixed; 1 conscious pattern adaptation (consistent with plan).
**Impact on plan:** Zero scope creep; all 6 acceptance criteria for Task 2 + 5 for Task 1 satisfied.

## Issues Encountered

None. The backend contract from plan 02-01 and primitives from plan 02-02 held exactly. No error-code discoveries, no race conditions exercised in tests that required fix.

## Authentication Gates

None triggered. Pure frontend plan — all tests use mocked `userService` with mocked `{response:{status, data:{error}}}` objects; no live HTTP, no real auth tokens.

## User Setup Required

None. No new environment variables, no external services, no migration steps.

## Known Stubs

None. Every declared feature is wired:
- Edit modal: fully interactive (role radios + PermissionPicker + PasswordField + Save button).
- Deactivate flow: ConfirmDialog → userService.deactivate → replaceRow.
- Self-lockout guard: isSelf() at both layers.
- Error mapping: every documented error code maps to displayed copy.

## Threat Flags

None. All new surface falls under the plan's `<threat_model>` block (T-02-14 through T-02-18, all mitigated in place). No new network endpoints — this plan consumes existing backend routes from plan 02-01 only.

## Next Phase Readiness

Phase 2 is closed. Ready for Phase 3:

- `ConfirmDialog` primitive available for bilty/freight/order destructive flows.
- `handleDeactivateConfirm` pattern (status-aware error mapping + reloadList on stale row) is the template for any "flip-a-boolean via confirm" action in future plans.
- `usersController.mapUpdateUserError` centralises the 409-username-taken / 404-user-not-found pattern — reusable for other entities.
- The two-layer self-lockout pattern (client pre-check + server-authoritative 409) generalises to any "admin destructive action on self" guard (e.g., "admin cannot revoke own role").

No blockers for Phase 3.

---
*Phase: 02-user-management*
*Completed: 2026-04-18*

## Self-Check: PASSED

- `frontend/src/components/ConfirmDialog.tsx` — FOUND (plan 02-03, T1 GREEN commit `0517582`)
- `frontend/src/utils/userValidation.ts::validateUpdateUser` — FOUND (exported)
- `frontend/src/screens/UsersScreen.tsx` — contains `ConfirmDialog` import + render, `isSelf(currentUser, r)` guard, Edit modal with role/permissions/password fields
- `frontend/src/screens/usersController.ts` — contains `isSelf`, `handleEditUserSubmit`, `handleDeactivateConfirm`, `mapUpdateUserError`, `mapDeactivateError`
- 4 task commits in git log: `ce2a3a8`, `0517582`, `2e84c61`, `c1fff16`
- Test suite: **71/71 passing** (4 suites, 2.3s) — 25 create-validator + 8 edit-validator + 20 screen-level + Phase-1 guards
- Zero hardcoded hex in `UsersScreen.tsx` and `ConfirmDialog.tsx`
- ConfirmDialog composes `<Modal/>` (verified via import `from './Modal'`)
