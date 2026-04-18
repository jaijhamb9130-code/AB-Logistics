# Roadmap: AB Logistics

## Overview

Six phases take AB Logistics from an empty repo to a fully operational cross-platform logistics management app. Phase 1 establishes the Expo project, navigation shell, and authenticated backend. Phases 2–5 build every module in dependency order (users → bilty → freight → orders/vehicles). Phase 6 delivers the role-based dashboard that makes the whole system visible.

## Phases

- [ ] **Phase 1: Foundation** - Expo setup, navigation, auth backend + login screen
- [ ] **Phase 2: User Management** - Admin user CRUD and RBAC screens
- [x] **Phase 3: Bilty Module** - Full bilty entry form, backend API, DB schema
- [x] **Phase 4: Freight Memo** - Auto-generation from bilty, read-only ledger, print format
- [x] **Phase 5: Orders & Vehicles** - Order management, vehicle/fleet management, assignment
- [x] **Phase 6: Reports & Dashboard** - Role-based dashboard, summary stats, history views

## Phase Details

### Phase 1: Foundation
**Goal**: The app runs on all three platforms, navigation shell exists, and users can securely log in with role-based redirection
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, BE-04, BE-05, CROSS-01, CROSS-02, CROSS-03, CROSS-04, CROSS-05
**Success Criteria** (what must be TRUE):
  1. App launches without errors on Android, iOS, and Web via Expo
  2. User can log in with username/password through a glassmorphism screen with field validation, password toggle, and loading state
  3. Logged-in admin is redirected to a full dashboard shell; staff is redirected to a limited view
  4. Navigating to any protected route while unauthenticated redirects to the login screen
  5. Auth state persists across navigation without requiring re-login
**Plans**: TBD
**UI hint**: yes

### Phase 2: User Management
**Goal**: Admin can create, view, edit, and deactivate users with role and permission assignments
**Depends on**: Phase 1
**Requirements**: USER-01, USER-02, USER-03, USER-04, USER-05
**Success Criteria** (what must be TRUE):
  1. Admin can create a new user with username, password, role (Admin/Staff), and permissions
  2. Admin can view a list of all users
  3. Admin can edit an existing user's role and permissions
  4. Admin can deactivate or delete a user
**Plans**: 3 plans
  - [x] 02-01-PLAN.md — Backend: user CRUD endpoints, canonical permissions, model extensions, self-lockout guard
  - [x] 02-02-PLAN.md — Frontend: userService + DataTable/Modal/PermissionPicker primitives + Users list + New User modal
  - [x] 02-03-PLAN.md — Frontend: Edit user modal + Deactivate flow + ConfirmDialog + client self-lockout guard
**UI hint**: yes

### Phase 3: Bilty Module
**Goal**: Staff can create, save, and view bilties with dynamic item, advance, and fuel tables backed by a normalized MySQL schema
**Depends on**: Phase 2
**Requirements**: BILTY-01, BILTY-02, BILTY-03, BILTY-04, BILTY-05, BILTY-06, BILTY-07, BILTY-08, BE-01, BE-02, BE-03
**Success Criteria** (what must be TRUE):
  1. User can fill in bilty header fields and get an auto-generated bilty_no on save
  2. User can add, edit, and delete rows in the items, advance details, and fuel details tables within a single form
  3. Saving a bilty validates required fields (consignor, truck_no, at least one item) and persists all three sub-tables to the backend
  4. User can view a list of all bilties and open a single bilty detail view
**Plans**: 1 speed-run pass (see .planning/phases/03-bilty/03-SUMMARY.md)
  - [x] Backend: schema + biltyModel + biltyController + routes + 12 tests
  - [x] Frontend: shared types + biltyService + BiltyScreen/Form/Detail + BiltyStack + 14 tests
**UI hint**: yes

### Phase 4: Freight Memo
**Goal**: A saved bilty automatically produces a read-only, printable freight memo with correct totals derived purely from bilty data
**Depends on**: Phase 3
**Requirements**: FREIGHT-01, FREIGHT-02, FREIGHT-03, FREIGHT-04, FREIGHT-05, FREIGHT-06
**Success Criteria** (what must be TRUE):
  1. Triggering memo generation from a saved bilty creates a freight memo without any manual input
  2. freight_total equals SUM(qty x rate); net_payable equals freight_total minus advance and fuel totals
  3. The memo UI is fully read-only — no edit controls are shown or accessible
  4. Memo renders in a printable A4 ledger format with debit/credit columns and company header
**Plans**: 1 speed-run pass (see .planning/phases/04-freight/04-SUMMARY.md)
  - [x] Backend: freight_memo schema + freightModel + freightController + routes + 13 tests
  - [x] Frontend: shared/freight types + freightService + FreightMemoScreen/DetailScreen + FreightStack + Generate button on BiltyDetail + 9 tests
**UI hint**: yes

### Phase 5: Orders & Vehicles
**Goal**: Users can create and track transport orders and manage the vehicle fleet, including assigning vehicles to orders
**Depends on**: Phase 3
**Requirements**: ORDER-01, ORDER-02, ORDER-03, ORDER-04, VEHICLE-01, VEHICLE-02, VEHICLE-03
**Success Criteria** (what must be TRUE):
  1. User can create a transport order and view its detail
  2. Order list shows all orders with current status; status can be updated through pending → in-progress → completed
  3. Admin/staff can add a vehicle (number, type, owner) and view the vehicle list
  4. A vehicle can be assigned to an order
**Plans**: 1 speed-run pass (see .planning/phases/05-orders-vehicles/05-SUMMARY.md)
  - [x] Backend: vehicles + orders schema + vehicleModel + orderModel + controllers + routes + 23 tests
  - [x] Frontend: shared vehicle/order types + vehicleService + orderService + validators + VehiclesScreen + OrdersScreen + OrderDetailScreen + OrdersStack + VehiclesStack + AppTabs wiring + 15 tests
**UI hint**: yes

### Phase 6: Reports & Dashboard
**Goal**: Admin and staff each see a role-appropriate dashboard with summary stats and history views for bilties and orders
**Depends on**: Phase 5
**Requirements**: REPORT-01, REPORT-02, REPORT-03
**Success Criteria** (what must be TRUE):
  1. Dashboard displays summary stats (total bilties, orders, vehicles) sourced live from the backend
  2. Admin sees all stats; staff sees only stats permitted by their role
  3. User can access a report view showing bilty and order history
**Plans**: 1 speed-run pass (see .planning/phases/06-dashboard/06-SUMMARY.md)
  - [x] Backend: reportsController + routes + 8 tests (permission-gated summary + history)
  - [x] Frontend: shared report types + reportService + DashboardScreen (5-card grid) + ReportsScreen (tabbed history) + AppTabs wiring + 6 tests
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/TBD | Not started | - |
| 2. User Management | 3/3 | Complete | 2026-04-18 |
| 3. Bilty Module | 1/1 | Complete | 2026-04-18 |
| 4. Freight Memo | 1/1 | Complete | 2026-04-18 |
| 5. Orders & Vehicles | 1/1 | Complete | 2026-04-18 |
| 6. Reports & Dashboard | 1/1 | Complete | 2026-04-18 |
