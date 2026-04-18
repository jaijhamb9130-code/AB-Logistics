---
phase: 01-foundation
plan: 01
subsystem: scaffolding
tags: [monorepo, expo, express, shared-types, theme]
requires: []
provides:
  - Root npm workspaces (frontend, backend, shared)
  - Expo managed TS frontend (iOS + Android + Web) scaffold
  - Node.js + Express backend scaffold on port 3001
  - Shared TypeScript types (User, Role, LoginRequest, LoginResponse, RefreshResponse)
  - Locked theme tokens (colors, typography, spacing, radius)
affects: [all-future-phases]
tech-stack:
  added:
    - expo ~51
    - react-native 0.74
    - react-native-web ~0.19
    - "@react-navigation/native, stack, bottom-tabs"
    - expo-blur, expo-linear-gradient, expo-secure-store
    - axios
    - express ^4.21
    - helmet, cors, cookie-parser
    - jsonwebtoken, bcrypt
    - mysql2, dotenv, express-rate-limit
  patterns:
    - npm workspaces monorepo
    - shared/ types package (CommonJS+TS) importable via relative or @ablog/shared alias
    - theme tokens as single source of truth in frontend/src/constants/theme.ts
key-files:
  created:
    - package.json
    - .gitignore
    - README.md
    - shared/package.json
    - shared/tsconfig.json
    - shared/types/user.ts
    - shared/types/auth.ts
    - shared/types/index.ts
    - frontend/package.json
    - frontend/app.json
    - frontend/babel.config.js
    - frontend/tsconfig.json
    - frontend/index.ts
    - frontend/App.tsx
    - frontend/src/constants/theme.ts
    - frontend/src/constants/roles.ts
    - frontend/src/constants/env.ts
    - frontend/.gitignore
    - backend/package.json
    - backend/tsconfig.json
    - backend/.env.example
    - backend/.env
    - backend/.gitignore
    - backend/src/index.js
    - backend/src/config/env.js
  modified: []
decisions:
  - Hand-authored Expo files (instead of `npx create-expo-app`) — deterministic and offline-safe. Dependency versions pinned to Expo SDK 51 compatibility matrix; `npx expo install` recommended on first `npm install` to re-align if Expo SDK advances.
  - Backend uses JS (not TS) per plan — simpler boot, matches D-03 rationale.
  - `.env` committed locally to backend with placeholder dev values; `.env` is gitignored — only `.env.example` is tracked.
  - Added `shared/types/index.ts` barrel export so `@ablog/shared` resolves cleanly from both frontend and backend.
metrics:
  tasks_completed: 3
  commits: 1
  duration: "~10m"
  completed: 2026-04-18
---

# Phase 1 Plan 01: Foundation — Monorepo Scaffold Summary

Scaffolded the AB Logistics monorepo: root npm workspaces, Expo managed TypeScript frontend (iOS + Android + Web), Node.js + Express backend on :3001, and a `/shared` TypeScript types package. Locked color + typography tokens live in `frontend/src/constants/theme.ts` as the single source of truth for all future UI work.

## What Was Built

### Task 1 — Root + shared/types
- Root `package.json` with `workspaces: [frontend, backend, shared]` and npm scripts (`dev:frontend`, `dev:backend`, `seed:admin`).
- Root `.gitignore`, `README.md` quickstart.
- `/shared` package (`@ablog/shared`) with:
  - `types/user.ts` — `Role = 'admin' | 'staff'` and `User` interface (D-02).
  - `types/auth.ts` — `LoginRequest`, `LoginResponse`, `RefreshResponse`.
  - `types/index.ts` barrel export.
  - `tsconfig.json` targeting ES2020, strict.

### Task 2 — Expo frontend
- `/frontend/package.json` declares Expo SDK 51, React 18.2, React Native 0.74.5, React Native Web 0.19, all three navigators (`@react-navigation/native + stack + bottom-tabs`), `expo-blur`, `expo-linear-gradient`, `expo-secure-store`, `axios`.
- `app.json` with `"platforms": ["ios", "android", "web"]` and `"web": { "bundler": "metro" }` — satisfies CROSS-01/02/03.
- `tsconfig.json` extends `expo/tsconfig.base` with `@shared/*` path alias to `/shared`.
- `src/constants/theme.ts` locks D-06 colors (Primary `#2F6FED`, Background `#F5F7FA`, Card `#FFFFFF`, Border `#E2E8F0`, Success `#22C55E`, Warning `#F59E0B`, Danger `#EF4444`, Text `#0F172A`, Text-muted `#64748B`) and D-07 typography (`Inter_400Regular`, `Inter_600SemiBold`, `JetBrainsMono_400Regular`), plus `spacing` and `radius` scales.
- `src/constants/roles.ts` re-exports `Role` + `User` from shared, defines `PERMISSIONS` constants.
- `src/constants/env.ts` exposes `API_URL` via `EXPO_PUBLIC_API_URL`.
- `App.tsx` — minimal SafeArea + Text scaffold that renders "AB Logistics — Foundation scaffold OK".

### Task 3 — Node.js + Express backend
- `/backend/package.json` with deps: `express`, `mysql2`, `jsonwebtoken`, `bcrypt`, `cors`, `helmet`, `dotenv`, `cookie-parser`, `express-rate-limit`; dev: `nodemon`. Scripts: `start`, `dev`, `seed:admin`.
- `.env.example` documents `PORT`, `NODE_ENV`, `DATABASE_URL`, JWT secrets + TTLs, `CORS_ORIGIN`. Local `.env` copied for dev bootstrap (gitignored).
- `src/config/env.js` — central env loader via `dotenv`.
- `src/index.js` — boot file: `helmet()`, `cors({ origin: env.CORS_ORIGIN, credentials: true })`, `express.json({ limit: '1mb' })`, `cookie-parser`, `GET /api/health` returning `{ ok: true, ts }`, 404 handler, error handler. Listens on :3001 when run directly; also exports the app for tests.

## Decisions Made

- **Expo hand-authored vs `create-expo-app`:** Hand-authored the Expo files to avoid network dependency during scaffold. Dep versions follow the Expo SDK 51 matrix. On first machine setup, running `npx expo install` after `npm install` will re-align any drift.
- **Backend in JS (not TS):** Faster boot, no build step for dev. Shared TS types still resolvable at dev time via the `@shared/*` path alias in `backend/tsconfig.json` — used only for editor tooling / future type-checking.
- **Barrel export `shared/types/index.ts`:** Added so consumers can `import type { User, LoginRequest } from '@ablog/shared'` instead of deep-importing individual files.
- **`.env` committed with placeholder values locally only (gitignored):** Ensures `npm run dev:backend` works on first clone-and-copy without failing on undefined env. Real secrets never reach git.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added `shared/types/index.ts` barrel export**
- **Found during:** Task 1
- **Issue:** `shared/package.json` declared `"main": "types/index.ts"` but the plan only listed `user.ts` and `auth.ts`. Without an index, `import from '@ablog/shared'` would fail.
- **Fix:** Created `shared/types/index.ts` that re-exports from `./user` and `./auth`.
- **Files modified:** `shared/types/index.ts`
- **Commit:** (included in the single scaffold commit)

**2. [Rule 3 - Blocking issue] Added local `backend/.env` (gitignored)**
- **Found during:** Task 3
- **Issue:** Plan step 6 in Task 3 requires creating `.env` locally so dev can run immediately. Without it, `config/env.js` would return undefined secrets and the server would boot but future plans would fail on missing `DATABASE_URL` / JWT secrets.
- **Fix:** Copied `.env.example` → `.env`. `.gitignore` excludes `.env` from version control.
- **Files modified:** `backend/.env` (untracked — gitignored)
- **Commit:** n/a (gitignored file)

**3. [Rule 2] `index.ts` + `registerRootComponent` entry**
- **Found during:** Task 2
- **Issue:** Expo SDK 51 prefers an explicit `index.ts` entry that calls `registerRootComponent(App)`. Without it, Expo's `"main"` resolution falls back and can break bare-workflow builds.
- **Fix:** Added `frontend/index.ts` calling `registerRootComponent` and set `"main": "index.ts"` in `frontend/package.json`.
- **Files modified:** `frontend/index.ts`, `frontend/package.json`

## Verification

Plan verification commands are designed to run after `npm install`. At commit time (install not yet run), static checks pass:

- `package.json` workspaces include all three packages — PASS (grep confirmed)
- `shared/types/user.ts` exports `interface User` and `type Role` — PASS
- `shared/types/auth.ts` exports `LoginRequest`, `LoginResponse`, `RefreshResponse` — PASS
- `frontend/package.json` declares `expo-blur`, all three `@react-navigation/*`, `axios`, `expo-secure-store` — PASS
- `frontend/app.json` declares `platforms: [ios, android, web]` and `web.bundler: metro` — PASS
- `frontend/src/constants/theme.ts` contains `#2F6FED` and `JetBrainsMono` — PASS
- `backend/package.json` declares `express`, `mysql2`, `jsonwebtoken`, `bcrypt`, `cors`, `helmet`, `dotenv`, `cookie-parser` — PASS
- `backend/.env.example` contains `JWT_ACCESS_SECRET` — PASS
- `backend/src/index.js` calls `app.listen`, mounts `helmet`, `cors`, `cookieParser`, `express.json`, `/api/health`, 404, error handler — PASS

### Runtime verification (pending — requires `npm install`)
- `npm install` at repo root resolves all workspaces.
- `npm --prefix backend start` → `[backend] listening on :3001`.
- `curl http://localhost:3001/api/health` → `{ "ok": true, ts: <number> }`.
- `npm --prefix frontend run web` bundles and serves at http://localhost:19006.

These are expected to pass when the developer runs `npm install` on their machine.

## Auth Gates

None.

## Known Stubs

- `App.tsx` renders a placeholder text only. This is intentional per the plan; Plan 01-02 replaces it with `AppNavigator` (auth + tab stack).
- `backend/scripts/seed-admin.js` is referenced in `backend/package.json` scripts but not yet created. Plan 01-02 creates it per D-20.
- `backend/src/index.js` has no DB connection or auth routes yet — Plan 01-02 layer adds them.

All stubs are plan-boundary stubs — each will be resolved in Plan 01-02.

## Threat Flags

None. All files created stay within the plan's threat model (T-01-01 through T-01-05 are mitigated as designed).

## Expo SDK Version

**Expo SDK 51.0.28** (selected for React 18.2 + RN 0.74 compatibility). Exact pinned versions listed in `frontend/package.json`.

## Self-Check: PASSED

All files listed in frontmatter `key-files.created` exist on disk. Single commit captures the full scaffold per user instruction (`feat(phase-1): scaffold monorepo, expo frontend, express backend, shared types`).
