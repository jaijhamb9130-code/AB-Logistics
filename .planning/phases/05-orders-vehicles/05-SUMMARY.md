---
phase: 5
name: orders-and-vehicles
status: complete
completed: 2026-04-18
backend_tests: 108/108
frontend_tests: 116/116
requirements:
  - ORDER-01
  - ORDER-02
  - ORDER-03
  - ORDER-04
  - VEHICLE-01
  - VEHICLE-02
  - VEHICLE-03
files_created:
  - backend/src/models/vehicleModel.js
  - backend/src/models/orderModel.js
  - backend/src/controllers/vehiclesController.js
  - backend/src/controllers/ordersController.js
  - backend/src/routes/vehicles.js
  - backend/src/routes/orders.js
  - backend/tests/vehicles.test.js
  - backend/tests/orders.test.js
  - shared/types/vehicle.ts
  - shared/types/order.ts
  - frontend/src/services/vehicleService.ts
  - frontend/src/services/orderService.ts
  - frontend/src/utils/vehicleValidation.ts
  - frontend/src/utils/vehicleValidation.test.ts
  - frontend/src/utils/orderValidation.ts
  - frontend/src/utils/orderValidation.test.ts
  - frontend/src/screens/VehiclesScreen.tsx
  - frontend/src/screens/OrdersScreen.tsx
  - frontend/src/screens/OrderDetailScreen.tsx
  - frontend/src/screens/OrdersScreen.test.tsx
  - frontend/src/screens/VehiclesScreen.test.tsx
  - frontend/src/navigation/OrdersStack.tsx
  - frontend/src/navigation/VehiclesStack.tsx
files_modified:
  - backend/src/db/schema.sql
  - backend/src/app.js
  - shared/types/index.ts
  - frontend/src/navigation/types.ts
  - frontend/src/navigation/AppTabs.tsx
---

# Phase 5 — Orders & Vehicles

## One-liner

End-to-end Orders (create, list, advance status, assign vehicle) and Vehicles (CRUD + soft-deactivate) modules with a forward-only status state machine (`pending → in_progress → completed`) enforced on both server and client.

## What was built

### Backend
- **Schema** (`backend/src/db/schema.sql`): idempotent `vehicles` (`vehicle_no UNIQUE`, `vehicle_type`, `owner_name`, `is_active`, timestamps) and `orders` (`order_no UNIQUE`, `order_date`, `customer_name`, `from_loc/to_loc`, `goods_desc`, `status ENUM('pending','in_progress','completed') DEFAULT 'pending'`, `vehicle_id` FK SET NULL, `created_by` FK users).
- **vehicleModel** — `findAll/findById/findByVehicleNo/create/update/setActive`.
- **orderModel** — transactional `nextOrderNo` (`OR-YYYY-NNNNNN` per-year, FOR UPDATE), `isValidTransition` state machine, `create`, `findAll/findById` with LEFT JOIN vehicles, `updateStatus` (throws `invalid_status_transition`), `assignVehicle` (throws `vehicle_not_found`).
- **Controllers** — map model errors to HTTP: `409 vehicle_no_taken`, `400 invalid_status_transition`, `404 vehicle_not_found`, `404 order_not_found`.
- **Routes** — `/api/vehicles` (GET guarded by `vehicle.read`; POST/PATCH guarded by `vehicle.edit`), `/api/orders` (GET by `order.read`; POST/PATCH by `order.edit`). Mounted in `app.js`.

### Frontend
- **Shared types** — `Vehicle`, `OrderStatus`, `OrderListItem`, `OrderDetail` (with joined `vehicle_type`, `vehicle_owner_name`), request/response shapes.
- **Services** — `vehicleService` (list/get/create/update/deactivate), `orderService` (list/get/create/updateStatus/assignVehicle).
- **Validators + tests** — `validateVehicle` (4 cases), `validateOrder` + `canAdvance` + `nextStatus` (4 cases).
- **Screens:**
  - `VehiclesScreen` — DataTable (vehicle_no, type, owner, status badge, actions), Modal form shared by create+edit, ConfirmDialog for deactivate, server error mapping.
  - `OrdersScreen` — DataTable (order_no, date, customer, route, status pill, vehicle, View), New Order Modal, row-tap → OrderDetail.
  - `OrderDetailScreen` — fields + status pill + vehicle block, **Advance Status** button (disabled on `completed`), **Assign Vehicle** modal listing `is_active` vehicles.
- **Navigation** — new `OrdersStack` (OrderList → OrderDetail) and `VehiclesStack` (VehicleList only, future-ready), both mounted in `AppTabs` after Freight. Guards allow both for all authenticated users (backend enforces permissions).

## Status state machine

`pending → in_progress → completed` (forward-only). Enforced in `orderModel.isValidTransition` → controller returns `400 invalid_status_transition` on violation; frontend `canAdvance` disables the button on `completed` and mirrors the server error message.

## Tests

| Suite | Count | Notes |
|-------|------:|-------|
| Backend total | 108 | up from 85 |
| `orders.test.js` | 15 | create/list/get, advance happy-path, 400 invalid transition, assign vehicle, 404 missing vehicle, 400 invalid vehicle id, 403 without `order.edit`, 4 pure `isValidTransition` cases |
| `vehicles.test.js` | 8 | create/list/get/update/deactivate, 400 invalid vehicle_no, 403 without `vehicle.edit`, 404 |
| Frontend total | 116 | up from 101 |
| `orderValidation.test.ts` | 4 | required customer, happy path, `canAdvance`, `nextStatus` |
| `vehicleValidation.test.ts` | 4 | regex, required, empty |
| `OrdersScreen.test.tsx` | 4 | service shape, list, create, updateStatus contract |
| `VehiclesScreen.test.tsx` | 3 | service shape, list, create contract |

## Decisions

- Reused the per-year `FOR UPDATE` sequence pattern from bilty/freight for `order_no`, keeping ID allocation deterministic across crashes.
- Kept the status machine in the model layer with thrown `Error` carrying `.code = 'invalid_status_transition'`, so the controller layer stays thin and reusable.
- Added `vehicle_type` + `vehicle_owner_name` to `OrderDetail` (LEFT JOIN pass-through) rather than forcing the UI to re-fetch the vehicle.
- Status pill is a local `statusStyles()` helper on theme tokens — avoids a new component for three states.
- `VehiclesStack` kept as a stack with one route so a future Vehicle Detail screen slots in without touching tab config.

## Deviations from Plan

None — all seven requirements land exactly as scoped.

## Self-Check: PASSED

- Backend: `108/108` tests green after `npm test`.
- Frontend: `116/116` tests green after `npm test`.
- Schema applied: `node scripts/init-db.js` → `OK — schema applied`.
- All files listed in `files_created` exist on disk (verified by successful jest resolution + schema apply).
- New tabs wired via `AppTabs.tsx` using existing `canAccessTab` guard.
- No git commits created — working tree left dirty as instructed.
