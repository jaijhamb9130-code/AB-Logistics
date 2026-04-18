# AB Logistics

## What This Is

A cross-platform transportation management system built with Expo + React Native Web. AB Logistics handles goods transportation between locations, manages vehicle fleets, and controls logistics operations. The system operates with role-based staff access — admins create and manage users, staff access permitted modules based on their roles.

The UI follows a Glassmorphism design system but with Tally-style dense data layouts for transaction-heavy screens (Bilty, Freight Memo).

## Core Value

Enable logistics operations staff to create bilties, auto-generate freight memos, manage orders and vehicles, and track business through dashboards — all from a single cross-platform app.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Expo (managed) + React Native Web |
| Navigation | React Navigation (Stack + Tab) |
| State | Context API (auth) |
| UI Style | Glassmorphism + Tally-dense data UI |
| Backend | Node.js + Express |
| Database | MySQL (normalized) |
| Architecture | Component-Based, clean separation of concerns |

## Modules (v1)

| Module | Description |
|--------|-------------|
| Auth / Login | Secure login with glassmorphism UI, role-based redirect |
| User Management | Admin creates/manages users, assigns roles & permissions |
| Bilty Entry | Core transaction entry — dynamic multi-table form |
| Freight Memo | Auto-generated from Bilty — read-only, printable ledger |
| Order Management | Create, view, and track transport orders |
| Vehicle / Fleet | Manage vehicles, assign to orders |
| Reports / Dashboard | Overview stats for admin and staff |

## Roles & Permissions

```
Admin   → full access (user management, all modules, reports)
Staff   → restricted (view orders, bilty entry, assigned modules)
```

```
User {
  username: string
  password: string
  role: "admin" | "staff"
  permissions: string[]
}
```

## Key Data Structures

### Bilty
```
Bilty {
  bilty_no: string (auto-generated)
  date: Date
  consignor, owner_name, agent_name, branch, zone_name: string
  truck_no, goods_type, truck_type: string
  items: [{ challan_no, lr_no, from, to, consignee, qty, rate, inc_rate, l_rate, e_rate }]
  advance_details: [{ date, adv_from, amount, narration }]
  fuel_details: [{ from, amount, doc_no, doc_date }]
  status: "CREATED" | "COMPLETED"
}
```

### FreightMemo (derived — never manually entered)
```
FreightMemo {
  memo_no, bilty_id: string
  freight_total = SUM(qty × rate)
  advance_total = SUM(advance.amount)
  fuel_total    = SUM(fuel.amount)
  net_payable   = freight_total - (advance_total + fuel_total)
}
```

## DB Schema (MySQL — normalized)

| Table | Key Columns |
|-------|-------------|
| `bilty` | id, bilty_no, date, consignor, owner_name, agent_name, branch, zone_name, truck_no, goods_type, truck_type |
| `bilty_items` | id, bilty_id(FK), challan_no, lr_no, from_location, to_location, consignee, qty, rate, inc_rate, l_rate, e_rate |
| `advance_details` | id, bilty_id(FK), date, adv_from, amount, narration |
| `fuel_details` | id, bilty_id(FK), from_location, amount, doc_no, doc_date |
| `freight_memo` | id, bilty_id(FK), freight_total, advance_total, fuel_total, net_payable, created_at |

## Navigation Flow

```
Login → Dashboard → Bilty Entry → Save → Generate Freight Memo
                 → Orders
                 → Vehicles
                 → Reports
                 → (Admin) User Management
```

## Folder Structure

```
/src
  /components       — GlassCard, InputField, PasswordField, ButtonPrimary, Loader, DataTable
  /screens          — LoginScreen, DashboardScreen, BiltyScreen, FreightMemoScreen, etc.
  /services         — authService, biltyService, freightService, orderService
  /context          — AuthContext
  /navigation       — AppNavigator, AuthNavigator
  /constants        — roles, permissions, colors, theme
```

## Critical Rules

- Freight Memo MUST NEVER accept manual edits — always derived from bilty
- `bilty_id` is single source of truth for freight calculations
- Do not duplicate item data in freight table — compute on demand
- Order/memo counts depend on bilty_id only

## API Contracts (v1)

```
POST   /auth/login
POST   /auth/logout
POST   /users              (admin only)
GET    /users              (admin only)
POST   /bilty
GET    /bilty/:id
GET    /bilty              (list)
POST   /freight/generate   (derives from bilty_id)
GET    /freight/:bilty_id
GET    /orders
POST   /orders
GET    /vehicles
POST   /vehicles
GET    /reports/dashboard
```

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Glassmorphism login screen with validation, password toggle, loading state
- [ ] Role-based auth with Context API and role-based navigation redirect
- [ ] Admin user management screen (create users, assign roles/permissions)
- [ ] Bilty entry form with dynamic item/advance/fuel tables
- [ ] Auto-generated Freight Memo derived from Bilty (read-only, printable)
- [ ] Order management (create, view, track)
- [ ] Vehicle/fleet management
- [ ] Reports/dashboard with overview stats
- [ ] Node.js + Express + MySQL backend with normalized schema
- [ ] Cross-platform: Android, iOS, Web via Expo + React Native Web

### Out of Scope

| Feature | Reason |
|---------|--------|
| Pricing / Rate Management | Deferred to v2 — scope decision |
| Manual Freight Memo editing | By design — data integrity rule |
| Real-time tracking / GPS | v2 |
| Payment processing | v2 |

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Expo managed (not bare RN) | Faster web + mobile setup, easier iteration | — Pending |
| MySQL over MongoDB | Logistics data is relational — bilty→items FK integrity matters | — Pending |
| React Navigation over Expo Router | Broader ecosystem, stable for complex nav flows | — Pending |
| Freight Memo read-only | Data integrity — single source of truth from bilty | — Confirmed |
| Admin manages users in-app | No separate admin portal needed for v1 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions

**After each milestone:**
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?

---
*Last updated: 2026-04-18 after initialization*
