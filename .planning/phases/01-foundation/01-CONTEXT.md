# Phase 1: Foundation - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 1 delivers: a working Expo monorepo (frontend + backend), React Navigation shell, JWT-authenticated Node.js/Express/MySQL backend, and a glassmorphism login screen with role-based redirect. All three platforms (Android, iOS, Web) verified working. No feature modules yet — just the secure foundation everything else builds on.

</domain>

<decisions>
## Implementation Decisions

### Project Structure
- **D-01:** Monorepo — single git repo with `/frontend` (Expo managed) and `/backend` (Node.js + Express) as sibling directories
- **D-02:** Shared `/shared` or `/types` folder at root for TypeScript interfaces (User, Role, etc.) shared between frontend and backend
- **D-03:** Backend runs on a separate port (e.g., 3001) during development; frontend proxies API calls via Expo config

### UI Theme System
- **D-04:** Hybrid UI — two distinct visual modes in the same app:
  - **Glassmorphism zones:** Login screen, Dashboard summary cards, Modals/popups — use `expo-blur` BlurView + semi-transparent backgrounds
  - **Enterprise Minimal zones:** All data-heavy screens (Bilty, Freight Memo, Tables, Forms) — flat, Tally-style, grid-first, zero visual noise
- **D-05:** Glassmorphism implementation: `expo-blur` (native BlurView) for login card and dashboard cards. Pure StyleSheet + opacity for all other screens.
- **D-06:** Color system (locked — used across all phases):
  ```
  Primary:    #2F6FED
  Background: #F5F7FA
  Card:       #FFFFFF
  Border:     #E2E8F0
  Success:    #22C55E
  Warning:    #F59E0B
  Danger:     #EF4444
  ```
- **D-07:** Typography:
  - UI text: Inter or Roboto
  - Numbers, rates, quantities, totals: JetBrains Mono (monospace for alignment)

### Non-Negotiable UX Rules (apply to all phases)
- **D-08:** Tables must be: scrollable, inline-editable, keyboard-navigable
- **D-09:** Numbers always right-aligned
- **D-10:** Compact spacing — avoid large paddings in data views
- **D-11:** Sticky column/table headers in all list views
- **D-12:** Totals always clearly visible (pinned row or summary bar)

### Authentication & Security
- **D-13:** JWT-based auth — access token stored in memory (Context), refresh token in SecureStore (mobile) / httpOnly cookie (web)
- **D-14:** Backend: bcrypt for password hashing (min rounds: 10)
- **D-15:** All protected API routes require `Authorization: Bearer <token>` header — enforced by Express middleware
- **D-16:** Role/permission middleware on admin-only endpoints (separate from auth middleware)

### Navigation Shell
- **D-17:** Phase 1 delivers a navigation skeleton only — screens exist as stubs:
  - Auth stack: LoginScreen
  - App stack (post-login): DashboardScreen (stub), protected route guard
  - Admin tabs visible only when role = admin
- **D-18:** React Navigation: Stack navigator wrapping auth flow + bottom Tab navigator for main app
- **D-19:** Route guard: check AuthContext on navigator level — unauthenticated users always redirect to login

### First Admin Bootstrap
- **D-20:** Seed script (`/backend/scripts/seed-admin.js`) creates the first admin user on first run — hardcoded username/password printed to console and must be changed after login
- **D-21:** No "setup screen" in v1 — admin bootstrap is a backend-only operation

### Claude's Discretion
- Exact Expo SDK version: use latest stable at time of implementation
- Express middleware order (helmet, cors, auth) — standard secure defaults
- MySQL connection pooling strategy — use `mysql2` with pool config

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Planning
- `.planning/PROJECT.md` — Full project context, stack, folder structure, critical rules
- `.planning/REQUIREMENTS.md` — All v1 requirements; Phase 1 covers AUTH-01–07, BE-04–05, CROSS-01–05
- `.planning/ROADMAP.md` — Phase goals, success criteria, dependency chain

### This Phase
- `.planning/phases/01-foundation/01-CONTEXT.md` — This file

### UI Reference
- User-provided UI screenshot (admin panel): Tally-style minimal enterprise UI — reference for data-heavy screen layout (sidebar nav, breadcrumb header, data table with inline actions, pagination)

No external specs — all requirements and decisions captured above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None yet — greenfield project. Phase 1 creates the foundation all other phases build on.

### Established Patterns
- Component-based architecture: all UI broken into `/components` (reusable primitives) and `/screens` (page-level)
- Services layer: all API calls go through `/services/*.ts` — screens never call API directly
- Context: AuthContext is the single source of auth state — never use local state for auth

### Integration Points
- Backend API base URL configured via Expo env var (`EXPO_PUBLIC_API_URL`)
- Navigation guard lives at the navigator level (not in individual screens)
- Color tokens exported from `/constants/theme.ts` — all components import from there, never hardcode hex values

</code_context>

<specifics>
## Specific Ideas

- UI reference image shows: left sidebar nav with collapsible sections (MENU, USER SETTINGS, RULES), breadcrumb navigation, search + filter bar, data table with checkbox selection, status badges (Active/Inactive with colored dots), pagination with rows-per-page selector
- Login screen: centered glass card on gradient/blur background — premium entry point before transitioning to the flat enterprise data UI
- JetBrains Mono specifically requested for all numeric fields (rates, quantities, totals) to maintain alignment in dense tables

</specifics>

<deferred>
## Deferred Ideas

- Real-time WebSocket updates (mentioned as possible future feature) → v2
- SMS/email notifications on user creation → v2
- Biometric login (Face ID / fingerprint) → v2

### Reviewed Todos (not folded)
- None

</deferred>
