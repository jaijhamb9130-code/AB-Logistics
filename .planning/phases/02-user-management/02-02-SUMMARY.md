---
phase: 02-user-management
plan: 02
subsystem: users-frontend-list-create
tags: [frontend, react-native, expo, users, data-table, modal, permission-picker, tdd, jest]
requires:
  - phase: 02-01-users-backend-crud
    provides: "GET/POST /api/users, UserListItem/CreateUserRequest DTOs, canonical permission vocab, error-code glossary"
  - phase: 01-03-frontend-auth
    provides: "httpClient with Bearer+refresh, AuthContext.useAuth, InputField/PasswordField/ButtonPrimary/Loader/GlassCard components, theme tokens"
provides:
  - Typed userService wrapper (list, get, create, update, deactivate) over /api/users
  - PERMISSION_LIST + PERMISSION_LABELS + ROLE_OPTIONS constants (mirror of backend canonical vocab)
  - Pure validators: validateUsername / validatePassword / validateRole / validatePermissions / validateCreateUser
  - DataTable primitive — Tally-dense, sticky header, alt-row shading, right-aligned numerics, mono font for numbers
  - Modal primitive — cross-platform (RN + RN Web), backdrop, centered card, themed close button
  - PermissionPicker primitive — 2-column checkbox grid with wildcard "*" toggle
  - UsersScreen — real admin list + "New User" header button + modal-driven create flow
  - usersController orchestration module (ts-jest friendly, decouples business logic from RN render)
  - Error-code → user-copy mapping for username_taken / invalid_username / invalid_password / invalid_role / invalid_permissions
affects: [plan-02-03-users-edit-deactivate, all-future-admin-tables, all-future-modal-forms]
tech-stack:
  added:
    - "@testing-library/react-native (already present from Phase 1) — used for UsersScreen screen-level tests"
  patterns:
    - "Controller-extract pattern — orchestration logic (load/submit/validate/error-map) lives in a pure TS module (usersController.ts) that is ts-jest testable without the RN renderer"
    - "Error-code mapping table — a single Record<ServerCode, UserCopy> maps backend error strings to display copy; centralises i18n-readiness"
    - "DataTable primitive is theme-only (colors/spacing/typography/radius) — zero hardcoded hex across DataTable, Modal, PermissionPicker"
    - "Modal primitive uses RN's built-in Modal + RN Web polyfill — no extra native package, keeps Expo managed-workflow clean"
    - "PermissionPicker treats '*' as an exclusive mode — selecting it clears per-permission checkboxes; plan 02-03 will reuse this contract verbatim"
    - "Validators follow the Phase-1 validateLogin shape (FieldError union, partial error object) for consistency"
key-files:
  created:
    - frontend/src/services/userService.ts
    - frontend/src/utils/userValidation.ts
    - frontend/src/utils/userValidation.test.ts
    - frontend/src/components/DataTable.tsx
    - frontend/src/components/Modal.tsx
    - frontend/src/components/PermissionPicker.tsx
    - frontend/src/screens/UsersScreen.test.tsx
    - frontend/src/screens/usersController.ts
  modified:
    - frontend/src/constants/roles.ts
    - frontend/src/screens/UsersScreen.tsx
key-decisions:
  - "Extracted usersController.ts from UsersScreen.tsx — keeps business logic ts-jest-testable without booting the RN renderer; the screen becomes a thin view over the controller"
  - "PermissionPicker treats '*' (wildcard) as exclusive — selecting it clears and replaces the list, deselecting it clears to []; locks out individual checkboxes while '*' is active for a clear UX signal"
  - "Server error codes are mapped to user copy at the screen boundary, not at the service layer — keeps userService a pure transport layer; plan 02-03 reuses the same mapping for edit/deactivate"
  - "DataTable 'action' column intentionally reserved (not implemented) — plan 02-03 will add Edit/Deactivate row actions without touching the DataTable primitive API"
  - "Modal uses RN built-in Modal (works on web via RN Web) — avoids adding a third-party modal package to keep the Expo managed workflow light"
patterns-established:
  - "Screen-level tests mock './usersController' (not './services/userService') — tests the view + controller wiring, leaves pure controller logic to unit tests"
  - "All new components import tokens from constants/theme — lint check (regex grep for #RRGGBB) passes with zero occurrences"
  - "Validators return a partial error object ({} = valid); the screen does setErrs(v) then short-circuits if Object.keys(v).length > 0"
requirements-completed:
  - USER-01
  - USER-02
  - USER-05
duration: ~18m
completed: 2026-04-18
---

# Phase 2 Plan 02: Frontend User List + Create — Summary

**Real Tally-dense admin Users list backed by userService.list + modal-driven create flow wired to POST /api/users, with reusable DataTable / Modal / PermissionPicker primitives and 31 green tests.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-04-18
- **Completed:** 2026-04-18
- **Tasks:** 2 (both TDD: RED → GREEN)
- **Files created:** 8
- **Files modified:** 2

## Accomplishments

- Replaced the Phase-1 Users tab stub with a real data-dense list reading from GET /api/users
- Shipped a modal-driven "New User" flow that calls POST /api/users with role + permissions
- Built 3 reusable UI primitives (DataTable, Modal, PermissionPicker) that plan 02-03 will reuse verbatim for edit + deactivate
- Wrote pure validators (25 unit cases) + screen-level tests (6 behaviour cases) — 31/31 green
- Mapped every backend error code from plan 02-01 to user-readable copy

## Task Commits

1. **Task 1 RED** — `205cc0b` — `test(02-02): add failing tests for user-form validators`
2. **Task 1 GREEN** — `cae8110` — `feat(02-02): user-form validators, userService, DataTable/Modal/PermissionPicker primitives`
3. **Task 2 RED** — `38ac215` — `test(02-02): add failing tests for UsersScreen create-user flow`
4. **Task 2 GREEN** — `91e223e` — `feat(02-02): users screen with admin-only list + new-user modal (GREEN)`
5. **Plan metadata** — `(this commit)` — `docs(02-02): complete frontend user list + create plan`

## Files Created/Modified

### Created
- `frontend/src/services/userService.ts` — Typed wrapper for /api/users (list, get, create, update, deactivate). All calls ride on the shared `http` axios instance (Bearer + 401-refresh from Phase 1).
- `frontend/src/utils/userValidation.ts` — Pure validators: `validateUsername` (3–64, `[a-zA-Z0-9_.-]`), `validatePassword` (≥8), `validateRole` (admin/staff), `validatePermissions` (≥1), `validateCreateUser` (composite).
- `frontend/src/utils/userValidation.test.ts` — 25 ts-jest unit cases covering empty/too-short/invalid-format/valid paths and the composite shape.
- `frontend/src/components/DataTable.tsx` — Tally-dense table primitive (see Public API below).
- `frontend/src/components/Modal.tsx` — Cross-platform modal primitive.
- `frontend/src/components/PermissionPicker.tsx` — 2-column checkbox grid with wildcard toggle.
- `frontend/src/screens/UsersScreen.test.tsx` — 6 RTL screen-level cases (A–F from the plan behaviour block).
- `frontend/src/screens/usersController.ts` — Pure orchestration module extracted from UsersScreen for ts-jest testability (load/submit/error-map).

### Modified
- `frontend/src/constants/roles.ts` — Appended `PERMISSION_LIST`, `PERMISSION_LABELS`, `ROLE_OPTIONS`; existing Role/User/PERMISSIONS/Permission exports preserved.
- `frontend/src/screens/UsersScreen.tsx` — Fully replaced the Phase-1 "arrives later" stub with the real list + modal flow.

## Public API — Reusable Primitives (reused by plan 02-03)

### DataTable
```ts
interface DataTableColumn<T> {
  key: string;
  label: string;
  width?: number;
  align?: 'left' | 'right' | 'center';
  render?: (row: T) => React.ReactNode;
}
interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  keyExtractor: (row: T) => string | number;
  onRowPress?: (row: T) => void;
  stickyHeader?: boolean;  // default true
  emptyLabel?: string;     // default "No records"
}
```
Rules: sticky header (web `position:'sticky'`, native fixed View), right-aligned numeric columns, compact rows (paddingVertical = spacing.sm), alt-row background via colors.background on odd rows, numbers in typography.mono. **Zero hardcoded hex.**

### Modal
```ts
interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: number;  // default 520
}
```
Backdrop click calls onClose. Header has title + close "×" Pressable. Centered card uses `colors.card` / `radius.lg`. Backdrop is rgba overlay (the only rgba in the file — intentional, not a hex).

### PermissionPicker
```ts
interface PermissionPickerProps {
  value: Permission[];
  onChange: (next: Permission[]) => void;
  disabled?: boolean;
}
```
- 2-column grid over `PERMISSION_LIST` (labels from `PERMISSION_LABELS`)
- Top row: "All (wildcard *)" — checking sets value to `['*']` and clears per-item checkboxes; unchecking (when value was `['*']`) clears to `[]`
- When `['*']` is selected, individual checkboxes render disabled + visually checked
- `accessibilityRole="checkbox"` on every Pressable (keyboard-accessible on web)

## Error-Code → User-Copy Mapping

Wired inside `usersController.mapCreateError`; reused by plan 02-03 for edit flows.

| Server code | HTTP | User copy |
|---|---|---|
| `username_taken` | 409 | "That username is already taken." |
| `invalid_username` | 400 | "Username is invalid (3–64 chars, letters/digits/._-)." |
| `invalid_password` | 400 | "Password must be at least 8 characters." |
| `invalid_role` | 400 | "Role must be Admin or Staff." |
| `invalid_permissions` | 400 | "Select at least one permission." |
| _(any other / network)_ | — | "Could not create user. Try again." |

Client-side validators (`validateCreateUser`) short-circuit the submit BEFORE hitting the server — the server codes above are only surfaced when the backend contradicts (e.g. race on `username_taken`), mitigating T-02-10 (client-side validation bypass).

## Verification

| Check | Result |
|---|---|
| `npx jest src/screens/UsersScreen.test.tsx src/utils/userValidation.test.ts --no-coverage` | **31 passed / 0 failed** (2 suites, 3.6s) |
| `grep "userService.list" UsersScreen.tsx / usersController.ts` | PASS |
| `grep "userService.create" usersController.ts` | PASS |
| `grep "Stub\|arrives in a later phase" UsersScreen.tsx` | PASS (zero occurrences — stub fully replaced) |
| Hardcoded hex scan on DataTable / Modal / PermissionPicker / UsersScreen | PASS (zero `#RRGGBB`) |
| `PERMISSION_LIST` length = 8 non-wildcard permissions | PASS |
| All 3 reusable components import from `constants/theme` | PASS |

Total tests across the frontend suite remain green (25 validator + 6 screen-level + all pre-existing Phase-1 guards).

## Decisions Made

- **usersController extraction** — keeps business logic outside the RN renderer so ts-jest unit tests can cover load / submit / error-mapping without spinning up the full `@testing-library/react-native` pipeline. Documented here as a deviation because the plan listed only `UsersScreen.tsx` + its test under Task 2 files.
- **Wildcard-exclusive PermissionPicker** — selecting `*` replaces the array; contract locked in now so plan 02-03's edit flow sees the same behaviour.
- **Error-code mapping at the screen/controller boundary** (not in service) — `userService` stays a pure transport layer; mapping reused by plan 02-03.
- **Reserved action column** — deliberately left off the current DataTable columns array so plan 02-03 can add Edit/Deactivate without an API change to DataTable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Extracted `usersController.ts` from `UsersScreen.tsx`**
- **Found during:** Task 2 (RED phase — writing screen tests)
- **Issue:** The plan listed only `UsersScreen.tsx` + `UsersScreen.test.tsx` as Task 2 files. Putting all of load/submit/error-map logic inline made the RTL tests heavy and hard to assert against (every submit path needed the full `@testing-library/react-native` render cycle). Pure logic belongs in a ts-jest-friendly module.
- **Fix:** Extracted `createUsersController()` — a factory that returns `{ load, submit, mapCreateError }` — into `frontend/src/screens/usersController.ts`. The screen consumes it via `useMemo(() => createUsersController(userService), [])`. Screen tests mock `./usersController`; controller tests (folded into `UsersScreen.test.tsx`'s logic-only cases) assert the error-mapping and submit path directly.
- **Files modified:** `frontend/src/screens/UsersScreen.tsx`, `frontend/src/screens/usersController.ts` (new)
- **Verification:** All 6 behaviour bullets (A–F) assert against the same UI outcomes the plan specified; tests green in 3.6s.
- **Committed in:** `91e223e` (Task 2 GREEN)

---

**Total deviations:** 1 auto-fixed (Rule 3 — testability blocker)
**Impact on plan:** Zero scope creep; screen behaviour and file API are identical to the plan spec. The extraction is a structural improvement the tests forced — and plan 02-03 will naturally reuse the same controller factory for edit + deactivate.

## Issues Encountered

None. Backend contract from plan 02-01 held exactly; no error-code discoveries.

## User Setup Required

None — no new environment variables, no external services.

## Known Stubs

None. The Phase-1 stub at `UsersScreen.tsx` is fully replaced; `userService.update` and `userService.deactivate` are declared but **intentionally unused in this plan** — they are the wire contract plan 02-03 will consume (documented in the `userService` JSDoc and in the plan 02-02 objective).

## Threat Flags

None. All new surface falls under the plan's `<threat_model>` block. The PermissionPicker's wildcard toggle was flagged under T-02-05 (permission injection) and is mitigated identically to the backend — only strings in `PERMISSION_LIST ∪ {'*'}` can ever be produced by the UI, and the backend re-validates anyway.

## Next Phase Readiness

- Plan 02-03 (edit + deactivate) can start immediately:
  - `userService.update` and `userService.deactivate` already declared and typed
  - `DataTable` has a reserved action-column slot — add row-action renderers without API changes
  - `Modal` + `PermissionPicker` reusable verbatim for the edit form
  - `usersController` factory pattern ready to extend with `onEdit` / `onDeactivate` handlers
  - Error-code mapping table ready to extend with `user_not_found` and `self_lockout_forbidden`
- No blockers for plan 02-03.

---
*Phase: 02-user-management*
*Completed: 2026-04-18*

## Self-Check: PASSED

- All 8 files in `key-files.created` exist on disk.
- Both files in `key-files.modified` updated (PERMISSION_LIST in roles.ts; stub replaced in UsersScreen.tsx).
- 4 task commits in git log: `205cc0b`, `cae8110`, `38ac215`, `91e223e`.
- Test suite: **31/31 passing** (25 validator + 6 screen-level) in 3.6s.
