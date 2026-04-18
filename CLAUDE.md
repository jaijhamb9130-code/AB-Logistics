# AB Logistics — Project Guide

## Project

Cross-platform logistics management app: Expo + React Native Web frontend, Node.js + Express + MySQL backend.

**Planning docs:** `.planning/`
**Current state:** `.planning/STATE.md`
**Roadmap:** `.planning/ROADMAP.md`
**Requirements:** `.planning/REQUIREMENTS.md`

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Expo (managed) + React Native Web |
| Navigation | React Navigation (Stack + Tab) |
| State | Context API (auth) |
| UI | Glassmorphism + Tally-dense data tables |
| Backend | Node.js + Express |
| Database | MySQL (normalized) |

## Folder Structure

```
/src
  /components     — GlassCard, InputField, PasswordField, ButtonPrimary, Loader, DataTable
  /screens        — LoginScreen, DashboardScreen, BiltyScreen, FreightMemoScreen, ...
  /services       — authService, biltyService, freightService, orderService
  /context        — AuthContext
  /navigation     — AppNavigator, AuthNavigator
  /constants      — roles, permissions, colors, theme
/backend
  /routes         — auth, bilty, freight, orders, vehicles, users
  /controllers
  /middleware     — authMiddleware, roleMiddleware
  /models         — MySQL query files
  /db             — schema, migrations
```

## Critical Rules

- Freight Memo is NEVER manually entered — always derived from bilty via `bilty_id`
- Do not duplicate item data in freight_memo table — compute totals on demand
- JWT required on all protected API routes
- Role/permission middleware guards admin-only endpoints

## GSD Workflow

This project uses GSD for structured planning and execution.

**Next phase:** Run `/gsd-discuss-phase 1` (or `/gsd-plan-phase 1` to skip discussion)

**Phase commands:**
- `/gsd-discuss-phase N` — gather context before planning
- `/gsd-plan-phase N` — create execution plan
- `/gsd-execute-phase N` — run the plan
- `/gsd-verify-work` — verify phase deliverables
- `/gsd-progress` — check current state

**Config:** Interactive mode | Standard granularity | Plan check + Verifier enabled | Quality models
