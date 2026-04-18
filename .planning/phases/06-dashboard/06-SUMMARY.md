---
phase: 6
name: reports-and-dashboard
status: complete
completed: 2026-04-18
backend_tests: 116/116
frontend_tests: 122/122
requirements:
  - REPORT-01
  - REPORT-02
  - REPORT-03
files_created:
  - backend/src/controllers/reportsController.js
  - backend/src/routes/reports.js
  - backend/tests/reports.test.js
  - shared/types/report.ts
  - frontend/src/services/reportService.ts
  - frontend/src/screens/ReportsScreen.tsx
  - frontend/src/screens/DashboardScreen.test.tsx
  - frontend/src/screens/ReportsScreen.test.tsx
files_modified:
  - backend/src/app.js
  - shared/types/index.ts
  - frontend/src/screens/DashboardScreen.tsx
  - frontend/src/navigation/AppTabs.tsx
  - frontend/src/navigation/types.ts
  - frontend/src/navigation/guards.ts
---

# Phase 6 — Reports & Dashboard

## One-liner

Role-aware Dashboard (welcome header + GlassCard stat grid) and Reports screen (tabbed Bilty/Order history) fed by two new permission-gated backend endpoints that zero-out / empty-out stats the caller can't see.

## What was built

### Backend
- **reportsController.js** — `getSummary` and `getHistory`. Permission gating lives INSIDE the handlers (not via `requirePermission`) because a user may have partial visibility: staff with only `bilty.read` must see bilty stats/history and zero/empty for the rest rather than a 403 on the whole endpoint.
  - `getSummary` → `{ bilties, freight_memos, orders, vehicles, active_users, permissions: { bilty, freight, order, vehicle, report } }`. Counts come from a thin `SELECT COUNT(*) AS c FROM <table>` helper on the shared pool. Active-user count is `is_active = 1` only and is gated by `report.read` (admin passes via `hasPerm` wildcard).
  - `getHistory` → `{ bilties: biltyModel.findAll().slice(0,20), orders: orderModel.findAll().slice(0,20), permissions: { bilty, order } }`. Gated arrays short-circuit to `[]` so the frontend can still render the shell.
- **routes/reports.js** — mounted at `/api/reports`, `authMw` applied router-wide; `GET /summary` + `GET /history`.
- **app.js** — router mounted after vehicles.
- **Tests: `backend/tests/reports.test.js`** (8 new):
  1. `GET /summary` 401 without JWT
  2. `GET /summary` 200 admin — all 5 counts returned, permissions all-true
  3. `GET /summary` 200 staff with `bilty.read` — bilty + freight populated, others zero, `pool.execute` called exactly twice
  4. `GET /summary` 200 staff with `vehicle.read` — only vehicles count, `pool.execute` called once
  5. `GET /history` 401 without JWT
  6. `GET /history` 200 admin — both arrays populated
  7. `GET /history` 200 staff with `order.read` — bilties `[]`, `biltyModel.findAll` never called
  8. `GET /history` 200 caps arrays at 20

### Frontend
- **Shared types** — `ReportSummary`, `ReportSummaryPermissions`, `ReportHistory`, `ReportHistoryPermissions` mirroring the backend payload. History arrays reuse the existing `BiltyListItem` / `OrderListItem`.
- **reportService.ts** — typed `getSummary()` / `getHistory()` over `httpClient`.
- **DashboardScreen.tsx (replaced stub)** — welcome header (username + role), 5-card GlassCard grid (Bilties / Freight Memos / Orders / Vehicles / Active Users). Each `StatCard` renders `"—"` when `visible === false`, so unpermitted cards still lay out cleanly instead of disappearing. Loader during first fetch, error banner on failure, re-fetch via `useFocusEffect`. Keeps the Phase 1 Logout button.
- **ReportsScreen.tsx (new)** — tabbed shell: Bilty History + Order History using the existing DataTable primitive. Tabs render only for `permissions.bilty` / `permissions.order`; if a user has neither, the screen shows an empty-state. Default tab auto-selects the first permitted one. Bilty columns: bilty_no / date / consignor / truck / items (right-aligned). Order columns: order_no / date / customer / route / status pill / vehicle. Status pill reuses the Phase 5 `statusStyles()` palette (grey / blue / green).
- **Navigation** — new `Reports` tab inserted between Vehicles and Users in `AppTabs.tsx`. `AppTabsParamList` extended with `Reports: undefined`. Tab is visible to all authenticated users (matches Bilty/Freight/Orders/Vehicles convention); backend enforces per-stat visibility and the screen hides tabs it can't populate.
- **Tests:**
  - `DashboardScreen.test.tsx` — 3 contract tests: service shape, admin payload with all-true permissions, staff payload with false flags for unpermitted stats.
  - `ReportsScreen.test.tsx` — 3 contract tests: admin gets both arrays, staff with `order.read` gets `bilties: []` + flag false, permission-less user gets `[]`/`[]` and both flags false.

## Permission mapping (controller ↔ UI)

| Permission      | Summary card       | History tab   |
|-----------------|--------------------|---------------|
| `bilty.read`    | Bilties            | Bilty History |
| `freight.read` (or `bilty.read` fallback) | Freight Memos | — |
| `order.read`    | Orders             | Order History |
| `vehicle.read`  | Vehicles           | —             |
| `report.read`   | Active Users       | —             |
| admin / `*`     | everything         | both tabs     |

## Tests

| Suite | Count | Notes |
|-------|------:|-------|
| Backend total | 116 | up from 108 |
| `reports.test.js` | 8 | summary + history happy paths, permission-gated counts, 401s, 20-row cap |
| Frontend total | 122 | up from 116 |
| `DashboardScreen.test.tsx` | 3 | service shape + admin/staff payload contracts |
| `ReportsScreen.test.tsx` | 3 | admin both arrays, staff partial, permission-less empty |

## Decisions

- **Permission gating in handlers, not middleware.** A partial-visibility dashboard can't use `requirePermission` (would 403 the whole endpoint). Instead, both handlers compute per-permission booleans and zero-out gated fields — the `permissions` object is returned so the UI doesn't need to re-derive it.
- **No new schema.** All stats derive from existing tables (`bilty`, `freight_memo`, `orders`, `vehicles`, `users`). Count helper uses plain `SELECT COUNT(*)` rather than extending each model, keeping Phase 3–5 models untouched.
- **Reports tab = universal, screen handles per-user gating.** Mirrors Phase 3–5's convention; avoids re-teaching `canAccessTab` to understand permission arrays.
- **20-row history cap server-side.** Keeps payload bounded without adding pagination; matches the "recent history" scope in the requirement.
- **Dashboard renders `"—"` for unpermitted cards instead of hiding them.** Preserves layout stability across roles and makes it obvious to staff what admin sees extra.
- **Active Users gated by `report.read`** (admin passes via wildcard) — matches the `<permission_mapping>` in the exec prompt.

## Deviations from Plan

- Added a `permissions` sub-object to both responses so the UI doesn't race the user's permissions payload. Minor extension of the spec; strictly additive.
- Freight Memos card uses `freight.read OR bilty.read` server-side because Phase 4 established freight visibility tracks bilty visibility. Documented above.

## Self-Check: PASSED

- Backend: `116/116` tests green after `npm test`.
- Frontend: `122/122` tests green after `npm test`.
- All files in `files_created` exist on disk (verified by successful jest resolution).
- New `/api/reports/*` routes mounted in `app.js`; Reports tab wired into `AppTabs` with new `TabName` in `navigation/types.ts`.
- No git commits created — working tree left dirty as instructed.
