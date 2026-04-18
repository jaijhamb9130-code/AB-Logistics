---
phase: 04
plan: speed-run
subsystem: freight-memo
tags: [freight, memo, derived, read-only, ledger, a4, print]
requires:
  - phase-03-bilty (bilty + items + advances + fuels tables)
  - phase-02 permission vocabulary (`bilty.edit`, `freight.read`)
  - phase-01 auth (JWT middleware, role/permission guard)
provides:
  - /api/freight/generate, /api/freight, /api/freight/:id, /api/freight/by-bilty/:biltyId
  - freight_memo table (one-memo-per-bilty constraint)
  - Freight tab + FreightMemoScreen (list) + FreightMemoDetailScreen (A4 ledger)
  - "Generate Freight Memo" button on BiltyDetailScreen
affects:
  - backend/src/app.js (router mount)
  - backend/src/db/schema.sql (freight_memo table)
  - frontend/src/screens/BiltyDetailScreen.tsx (generate button)
  - frontend/src/navigation/AppTabs.tsx + types.ts (Freight tab)
  - shared/types/index.ts (re-export)
tech-stack:
  added: []
  patterns:
    - "memo_no = FM-YYYY-NNNNNN (per-year sequence via SELECT ... FOR UPDATE inside transaction — same pattern as bilty_no)"
    - "One-memo-per-bilty enforced at DB (UNIQUE bilty_id) + app (txn FOR UPDATE guard) + controller (ER_DUP_ENTRY catch)"
    - "Totals stored on memo, but the displayed bilty snapshot is LIVE via biltyModel.findById on every GET"
    - "409 memo_exists = idempotent UX — both Generate buttons route to the existing memo instead of surfacing an error"
    - "Read-only contract: no PATCH/PUT/DELETE routes; UI has zero edit affordances; types have no edit/update fields"
key-files:
  created:
    - backend/src/models/freightModel.js
    - backend/src/controllers/freightController.js
    - backend/src/routes/freight.js
    - backend/tests/freight.test.js
    - shared/types/freight.ts
    - frontend/src/services/freightService.ts
    - frontend/src/screens/FreightMemoScreen.tsx
    - frontend/src/screens/FreightMemoDetailScreen.tsx
    - frontend/src/screens/FreightMemoScreen.test.tsx
    - frontend/src/screens/FreightMemoDetailScreen.test.tsx
    - frontend/src/navigation/FreightStack.tsx
  modified:
    - backend/src/db/schema.sql
    - backend/src/app.js
    - shared/types/index.ts
    - frontend/src/navigation/types.ts
    - frontend/src/navigation/AppTabs.tsx
    - frontend/src/screens/BiltyDetailScreen.tsx
decisions:
  - "freight_memo.bilty_id is UNIQUE (not nullable) — hard DB-level one-memo-per-bilty; attempts race-safe via FOR UPDATE inside txn"
  - "Memo stores totals; items/advances/fuels rows are NEVER copied. Display re-derives from live bilty — honors CLAUDE.md integrity rule"
  - "Generate permission = `bilty.edit` (not `freight.edit`) — writer of the bilty owns the derived memo; avoided inventing freight.edit since memo is read-only"
  - "409 memo_exists from both entry points (BiltyDetail button + FreightList picker modal) transparently routes to existing memo — idempotent UX"
  - "A4 ledger is pure RN View composition — no print CSS needed; Ctrl+P / window.print() on web renders the sheet acceptably"
  - "Ledger pairs debit(items) vs credit(advances + fuels) side-by-side to match traditional bilty/memo paper layout"
metrics:
  duration_minutes: ~20
  completed_date: 2026-04-18
  backend_tests: 85/85 (72 prior + 13 new)
  frontend_tests: 101/101 (92 prior + 9 new)
  files_new: 11
  files_modified: 6
---

# Phase 4 Freight Memo Summary

## One-liner

Freight Memo module: auto-derived from bilty via `/api/freight/generate`, backed by `freight_memo` table with UNIQUE(bilty_id), rendered as a read-only A4 debit/credit ledger with company header and highlighted Net Payable.

## What shipped

### Backend

- **Schema** (`backend/src/db/schema.sql`): `freight_memo` table with `memo_no UNIQUE`, `bilty_id UNIQUE` (one-memo-per-bilty), `memo_date`, four totals (`freight_total`, `advance_total`, `fuel_total`, `net_payable` all DECIMAL(12,2)), `generated_by FK users`, idempotent DDL. Applied via `node backend/scripts/init-db.js`.
- **Model** (`backend/src/models/freightModel.js`): `generateFromBilty(biltyId, userId)` loads the bilty via `biltyModel.findById`, runs a transactional guard (`SELECT ... FOR UPDATE` on existing memo), computes totals, allocates `memo_no` (`FM-YYYY-NNNNNN` per-year sequence), inserts the row. Throws typed errors `bilty_not_found` | `memo_exists`. Pure helper `computeTotals({items, advances, fuels})` exported and exercised by unit tests. `findById` returns the memo + live bilty snapshot (never stores duplicate item data). `findByBiltyId` supports idempotent navigation.
- **Controller** (`backend/src/controllers/freightController.js`): `POST /generate` (gated by `bilty.edit`), `GET /`, `GET /:id`, `GET /by-bilty/:biltyId` (all gated by `freight.read`). Maps typed errors to HTTP: 400 invalid_bilty_id | invalid_id, 404 bilty_not_found | memo_not_found, 409 memo_exists (also catches MySQL `ER_DUP_ENTRY` as safety-net).
- **Routes** (`backend/src/routes/freight.js`): router-wide `authMw` + per-route `requirePermission`. Mounted at `/api/freight` in `backend/src/app.js`.
- **Permissions**: `freight.read` was already in `backend/src/constants/permissions.js` (Phase 2 canonical vocabulary) and mirrored in `frontend/src/constants/roles.ts` — no changes needed.

### Frontend

- **Shared types** (`shared/types/freight.ts`): `FreightMemoListItem` (list row with joined bilty columns), `FreightMemoDetail` (memo + live `BiltyDetail` snapshot), `GenerateFreightResponse`, `FreightMemoByBilty`, `GenerateFreightRequest`. Re-exported via `shared/types/index.ts`.
- **Service** (`frontend/src/services/freightService.ts`): `list`, `get`, `generate(biltyId)`, `getByBiltyId(biltyId)` — all typed wrappers around the shared `httpClient` (Bearer attach + 401 refresh already wired by AuthProvider).
- **FreightMemoScreen** (`frontend/src/screens/FreightMemoScreen.tsx`): list view using `DataTable` (Memo No, Date, Bilty No, Consignor, Net Payable, Created, View). Header button "Generate from Bilty" opens a `Modal` with an embedded bilty-picker `DataTable`. Row tap calls `generate` → navigates to memo detail; 409 transparently fetches existing memo and navigates there. No manual entry path — CLAUDE.md rule honored.
- **FreightMemoDetailScreen** (`frontend/src/screens/FreightMemoDetailScreen.tsx`): A4 ledger sheet (max width 820). Company header "AB LOGISTICS" + "Freight Memo" tagline, memo no + date on the right. Bilty reference block (bilty_no, date, consignor, truck, goods, branch). Debit/Credit ledger with paired rows (debit = items `qty × rate`, credit = advances + fuels). Totals row (Freight Total vs Advance+Fuel), split advance/fuel sub-totals, highlighted Net Payable box. **Only affordances: Back + Print (web-only `window.print()`).** No edit controls anywhere.
- **Bilty integration** (`frontend/src/screens/BiltyDetailScreen.tsx`): "Generate Freight Memo" button in the header row. Dispatches cross-stack navigation (Freight tab → FreightDetail). 409 idempotency — routes to existing memo.
- **Navigation**: new `FreightStack.tsx` (FreightList → FreightDetail), added `Freight` tab to `AppTabs.tsx` via the existing `canAccessTab` helper (tab visible to all authenticated users; backend enforces `freight.read` per endpoint, mirrors Phase-3 Bilty pattern).

### Tests

- **Backend** `backend/tests/freight.test.js` — **13 new tests** (target was ~8): generate happy path, 409 memo_exists, 404 bilty_not_found, 400 invalid_bilty_id, 403 without `bilty.edit`; list happy + 403; get by id happy + 404; get by bilty id happy; `computeTotals` pinned math (multi-item sum, empty arrays, 2dp rounding). Full backend suite: **85/85 green** (72 prior + 13 new).
- **Frontend** — **9 new tests** (target was ~6) across `FreightMemoScreen.test.tsx` (service shape, list contract, generate contract, 409 propagation, getByBiltyId contract) and `FreightMemoDetailScreen.test.tsx` (FREIGHT-02/03 math via shared helpers, string-numeric tolerance, read-only shape assertion — no `edit`/`update`/`delete` fields). Full frontend suite: **101/101 green** (92 prior + 9 new).

## Requirement coverage

| Requirement | Implementation |
|-------------|----------------|
| FREIGHT-01  | Only creation path is `POST /api/freight/generate` with `{bilty_id}`; no PATCH/PUT; both UI entry points require selecting an existing bilty |
| FREIGHT-02  | `computeTotals` — `freight_total = SUM(qty × rate)` across items; covered by backend unit test and frontend `itemsTotal` test |
| FREIGHT-03  | `net_payable = freight_total − (advance_total + fuel_total)` — covered by backend `computeTotals` test and frontend `netPayable` test |
| FREIGHT-04  | No edit/update/delete routes; memo detail has only Back + Print buttons; types carry no mutation fields; test asserts absence |
| FREIGHT-05  | A4 sheet max-width 820, paired Debit/Credit columns, bordered totals row, highlighted Net Payable box |
| FREIGHT-06  | "AB LOGISTICS" + "Freight Memo" tagline in header; memo_no + date top-right |

## Deviations from plan

None. Plan executed exactly as written. Two scope-positive extras:

- Added a footer note ("auto-generated from bilty #X — read-only; corrections must be made on source bilty") to reinforce FREIGHT-01 intent for printed output.
- Made 409 `memo_exists` behave idempotently in BOTH entry points (picker + bilty button) by fetching and routing to the existing memo — better UX than plain error.

Delivered 13 backend tests and 9 frontend tests (plan asked ~8 and ~6); the extra coverage pins the math and read-only contract.

## Known stubs / threat flags

None. No hardcoded empty props, no "coming soon" placeholders. No new trust boundaries introduced — all endpoints pass through existing `authMw` + `requirePermission`.

## Files

**New (11):**
- `backend/src/models/freightModel.js`
- `backend/src/controllers/freightController.js`
- `backend/src/routes/freight.js`
- `backend/tests/freight.test.js`
- `shared/types/freight.ts`
- `frontend/src/services/freightService.ts`
- `frontend/src/screens/FreightMemoScreen.tsx`
- `frontend/src/screens/FreightMemoDetailScreen.tsx`
- `frontend/src/screens/FreightMemoScreen.test.tsx`
- `frontend/src/screens/FreightMemoDetailScreen.test.tsx`
- `frontend/src/navigation/FreightStack.tsx`

**Modified (6):**
- `backend/src/db/schema.sql` (added freight_memo table)
- `backend/src/app.js` (mounted /api/freight)
- `shared/types/index.ts` (re-export freight)
- `frontend/src/navigation/types.ts` (AppTabs + FreightStack param lists)
- `frontend/src/navigation/AppTabs.tsx` (Freight tab)
- `frontend/src/screens/BiltyDetailScreen.tsx` (Generate button + handler)

## Self-Check: PASSED

- `.planning/phases/04-freight/04-SUMMARY.md` FOUND (this file)
- `backend/src/models/freightModel.js` FOUND
- `backend/src/controllers/freightController.js` FOUND
- `backend/src/routes/freight.js` FOUND
- `backend/tests/freight.test.js` FOUND
- `shared/types/freight.ts` FOUND
- `frontend/src/services/freightService.ts` FOUND
- `frontend/src/screens/FreightMemoScreen.tsx` FOUND
- `frontend/src/screens/FreightMemoDetailScreen.tsx` FOUND
- `frontend/src/navigation/FreightStack.tsx` FOUND
- Backend suite: 85/85 PASS
- Frontend suite: 101/101 PASS
- Schema migrated: `[init-db] OK — schema applied.`
- NO COMMITS created (per user directive); working tree dirty for review
