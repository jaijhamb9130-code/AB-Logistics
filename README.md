# AB Logistics

Cross-platform transportation management system. Expo + React Native Web frontend, Node.js + Express + MySQL backend.

## Quickstart

```bash
# 1. Install dependencies (root + workspaces)
npm install

# 2. Configure backend env
cp backend/.env.example backend/.env
# edit backend/.env with your MySQL credentials + JWT secrets

# 3. Seed the first admin user (prints default username/password to console)
npm run seed:admin

# 4. Start the backend (listens on :3001)
npm run dev:backend

# 5. In a separate terminal, start the frontend (web on :19006)
npm run dev:frontend
# for iOS/Android: npm --prefix frontend run ios | npm --prefix frontend run android
```

## Structure

- `/frontend` — Expo managed app (iOS + Android + Web)
- `/backend`  — Node.js + Express API on port 3001
- `/shared`   — TypeScript interfaces shared across packages
- `/.planning` — GSD planning artifacts (phases, state, roadmap)

## Documentation

- [Project overview](.planning/PROJECT.md)
- [Requirements](.planning/REQUIREMENTS.md)
- [Roadmap](.planning/ROADMAP.md)
- [Current state](.planning/STATE.md)
