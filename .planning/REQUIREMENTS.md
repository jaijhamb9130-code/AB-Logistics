# Requirements: AB Logistics

**Defined:** 2026-04-18
**Core Value:** Cross-platform logistics management — bilty creation, freight memo generation, order/vehicle tracking, and role-based staff access in a single Expo + React Native Web app.

## v1 Requirements

### Authentication

- [ ] **AUTH-01**: User can log in with username and password via glassmorphism login screen
- [ ] **AUTH-02**: Login form validates required fields and shows inline errors
- [ ] **AUTH-03**: Password field has toggle visibility (mask/unmask)
- [ ] **AUTH-04**: Login button shows loading state during auth request
- [ ] **AUTH-05**: Auth state stored globally via Context API and persists across navigation
- [ ] **AUTH-06**: User is redirected to role-appropriate screen after login (admin → full dashboard, staff → limited view)
- [ ] **AUTH-07**: Unauthorized routes are protected — unauthenticated users redirected to login

### User Management

- [x] **USER-01**: Admin can create new users with username, password, role, and permissions
- [x] **USER-02**: Admin can view list of all users
- [x] **USER-03**: Admin can edit user roles and permissions
- [x] **USER-04**: Admin can deactivate/delete users
- [x] **USER-05**: Role options: Admin, Staff (with permission array)

### Bilty

- [x] **BILTY-01**: User can create a Bilty with header fields (bilty_no auto-generated, date, consignor, owner_name, agent_name, branch, zone_name, truck_no, goods_type, truck_type)
- [x] **BILTY-02**: Bilty form has dynamic item table — add/edit/delete rows (challan_no, lr_no, from, to, consignee, qty, rate, inc_rate, l_rate, e_rate)
- [x] **BILTY-03**: Bilty form has dynamic advance details table — add/edit/delete rows (date, adv_from, amount, narration)
- [x] **BILTY-04**: Bilty form has dynamic fuel details table — add/edit/delete rows (from, amount, doc_no, doc_date)
- [x] **BILTY-05**: Save Bilty validates required fields (consignor, truck_no, at least one item) and persists to backend
- [x] **BILTY-06**: Saved Bilty generates unique bilty_no
- [x] **BILTY-07**: User can view list of all bilties
- [x] **BILTY-08**: User can view a single Bilty detail

### Freight Memo

- [x] **FREIGHT-01**: Freight Memo is auto-generated from a saved Bilty (never manually entered)
- [x] **FREIGHT-02**: freight_total = SUM(qty × rate) across all bilty items
- [x] **FREIGHT-03**: net_payable = freight_total − (advance_total + fuel_total)
- [x] **FREIGHT-04**: Freight Memo is read-only — no edits allowed through UI
- [x] **FREIGHT-05**: Freight Memo displays in printable A4 ledger format with debit/credit columns
- [x] **FREIGHT-06**: Company header shown on printed/rendered memo

### Orders

- [x] **ORDER-01**: User can create a transport order
- [x] **ORDER-02**: User can view list of all orders with status
- [x] **ORDER-03**: User can view order detail
- [x] **ORDER-04**: Order status can be updated (pending → in-progress → completed)

### Vehicles / Fleet

- [x] **VEHICLE-01**: Admin/staff can add a vehicle (vehicle number, type, owner)
- [ ] **VEHICLE-02**: User can view vehicle list
- [ ] **VEHICLE-03**: Vehicle can be assigned to an order

### Reports / Dashboard

- [x] **REPORT-01**: Dashboard shows summary stats (total bilties, orders, vehicles)
- [x] **REPORT-02**: Role-based dashboard — admin sees all stats, staff sees permitted stats
- [x] **REPORT-03**: Basic report view for bilty and order history

### Backend & Database

- [x] **BE-01**: Node.js + Express API with MySQL (normalized schema)
- [x] **BE-02**: Tables: bilty, bilty_items, advance_details, fuel_details, freight_memo, orders, vehicles, users *(bilty + 3 children landed Phase 3; freight_memo/orders/vehicles pending Phase 4/5)*
- [x] **BE-03**: API endpoints: POST/GET bilty, POST freight/generate, GET freight/:id, orders CRUD, vehicles CRUD, auth login/logout *(bilty list/get/create landed Phase 3; freight/orders/vehicles pending Phase 4/5)*
- [ ] **BE-04**: JWT-based authentication on all protected routes
- [ ] **BE-05**: Role/permission middleware guards admin-only endpoints

### Cross-Platform

- [ ] **CROSS-01**: App runs on Android (Expo)
- [ ] **CROSS-02**: App runs on iOS (Expo)
- [ ] **CROSS-03**: App runs on Web (React Native Web)
- [ ] **CROSS-04**: Responsive layout adapts to mobile and desktop screen sizes
- [ ] **CROSS-05**: Platform-safe styling (no platform-specific CSS leaking into RN)

## v2 Requirements

### Pricing / Rate Management

- **PRICE-01**: Configure route-based pricing rules
- **PRICE-02**: Rate lookup during bilty creation
- **PRICE-03**: Auto-populate rate fields from pricing table

### Advanced Features

- **ADV-01**: Real-time GPS/tracking integration
- **ADV-02**: Payment processing
- **ADV-03**: SMS/email notifications on bilty creation

## Out of Scope

| Feature | Reason |
|---------|--------|
| Pricing / Rate Management | Deferred to v2 — scope decision |
| Manual Freight Memo editing | By design — data integrity rule (bilty_id is single source of truth) |
| Real-time GPS tracking | v2 |
| Payment processing | v2 |
| Separate admin portal (web-only) | Admin functionality embedded in the app |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| AUTH-05 | Phase 1 | Pending |
| AUTH-06 | Phase 1 | Pending |
| AUTH-07 | Phase 1 | Pending |
| BE-04 | Phase 1 | Pending |
| BE-05 | Phase 1 | Pending |
| CROSS-01 | Phase 1 | Pending |
| CROSS-02 | Phase 1 | Pending |
| CROSS-03 | Phase 1 | Pending |
| CROSS-04 | Phase 1 | Pending |
| CROSS-05 | Phase 1 | Pending |
| USER-01 | Phase 2 | Complete |
| USER-02 | Phase 2 | Complete |
| USER-03 | Phase 2 | Complete |
| USER-04 | Phase 2 | Complete |
| USER-05 | Phase 2 | Complete |
| BILTY-01 | Phase 3 | Complete |
| BILTY-02 | Phase 3 | Complete |
| BILTY-03 | Phase 3 | Complete |
| BILTY-04 | Phase 3 | Complete |
| BILTY-05 | Phase 3 | Complete |
| BILTY-06 | Phase 3 | Complete |
| BILTY-07 | Phase 3 | Complete |
| BILTY-08 | Phase 3 | Complete |
| BE-01 | Phase 3 | Complete |
| BE-02 | Phase 3 | Complete |
| BE-03 | Phase 3 | Complete |
| FREIGHT-01 | Phase 4 | Complete |
| FREIGHT-02 | Phase 4 | Complete |
| FREIGHT-03 | Phase 4 | Complete |
| FREIGHT-04 | Phase 4 | Complete |
| FREIGHT-05 | Phase 4 | Complete |
| FREIGHT-06 | Phase 4 | Complete |
| ORDER-01 | Phase 5 | Pending |
| ORDER-02 | Phase 5 | Pending |
| ORDER-03 | Phase 5 | Pending |
| ORDER-04 | Phase 5 | Pending |
| VEHICLE-01 | Phase 5 | Pending |
| VEHICLE-02 | Phase 5 | Pending |
| VEHICLE-03 | Phase 5 | Pending |
| REPORT-01 | Phase 6 | Complete |
| REPORT-02 | Phase 6 | Complete |
| REPORT-03 | Phase 6 | Complete |

**Coverage:**
- v1 requirements: 47 total
- Mapped to phases: 47
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-18*
*Last updated: 2026-04-18 — traceability updated with per-requirement phase assignments*
