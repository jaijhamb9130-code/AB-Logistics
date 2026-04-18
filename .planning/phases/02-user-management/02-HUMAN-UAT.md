---
status: partial
phase: 02-user-management
source:
  - 02-VERIFICATION.md
started: 2026-04-18T09:00:00Z
updated: 2026-04-18T09:00:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Visual — Tally-dense Users table
expected: Sticky header, compact rows, alt-row shading, right-aligned numeric ID, mono font for numbers, on web and native.
result: pending

### 2. Smoke — Create user happy + collision
expected: Admin creates a new user, row appears in table. Re-submitting the same username shows inline form error: "That username is already taken."
result: pending

### 3. Smoke — Deactivate flow
expected: Deactivate opens ConfirmDialog with red/danger confirm button. On confirm, row flips to Inactive in-place (no full refetch).
result: pending

### 4. Smoke — Self-lockout (client guard)
expected: Deactivate button on admin's own row is visibly disabled/greyed and unpressable. Pressing it does NOT open the ConfirmDialog.
result: pending

### 5. Smoke — Self-lockout (server belt)
expected: Bypassing the client guard via DevTools and calling DELETE /api/users/:own_id returns 409; UI shows Alert "You cannot deactivate your own account." and the row stays Active.
result: pending

### 6. Cross-platform — Users screen on web + iOS + Android
expected: UsersScreen loads, list renders, Modal + PermissionPicker + ConfirmDialog all open and function on Expo web, iOS, and Android.
result: pending

### 7. Smoke — Activate flow restores access
expected: An Inactive row shows a green "Activate" button (in place of the red Deactivate). Clicking opens a non-destructive ConfirmDialog (primary-coloured confirm, NOT red). On confirm, the row Status badge flips to Active in place (no full refetch). The reactivated user can log in immediately and all prior permissions are intact (spot check one permission-gated tab appears as before).
result: pending

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0
blocked: 0

## Gaps

[none]
