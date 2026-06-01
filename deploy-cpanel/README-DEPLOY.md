# AB Logistics — cPanel deploy

Single-domain layout: frontend at the document root, Node API behind a
local PM2 process on port `3009`, Apache reverse-proxies `/api/*` to it.

This bundle mirrors the final `public_html/` layout 1:1 — every file in
the deploy folder (except `database/` and this README) goes straight into
the document root with the same path.

```
deploy-cpanel/                  ← upload everything here as-is to public_html/
  .htaccess                     ← rewrite + caching at root
  index.html                    ← Expo Web entry
  metadata.json
  _expo/                        ← Expo JS bundle
  assets/                       ← fonts + images
  backend/                      ← Node API (kept inside)
    src/ scripts/
    package.json
    .env                        ← production secrets (already filled in)
    ecosystem.config.js
    node_modules/               ← created by `npm install` on server
    logs/                       ← created by PM2
  database/                     ← DEPLOY-ONLY — import via phpMyAdmin, don't upload
    ablogistics_seed.sql
  README-DEPLOY.md              ← this file (don't upload)
```

## 0. Prereqs (confirmed already done)

- Domain points to cPanel: `ablogistics.abstechnologies.org.in`
- MySQL DB created in cPanel:
  - DB: `abstechnologieso_ablogi`
  - User: `abstechnologieso_ablogi`
  - Password: `ablogi2026xabs2026`
  - User has `ALL PRIVILEGES` on the DB
- cPanel host has Node.js + npm + PM2 available (SSH or "Setup Node.js App")

## 1. Import the database (phpMyAdmin)

1. Open cPanel → **phpMyAdmin**.
2. Select the `abstechnologieso_ablogi` database in the left sidebar.
3. Click **Import** → choose `database/ablogistics_seed.sql` → **Go**.

The dump is a full reset (`DROP TABLE IF EXISTS` for every table, then
`CREATE TABLE`, then row data). It includes:

- Admin user: **`admin` / `Admin@1234`**
- The 28 system `ledger_group` rows + Vehicles sub-group of Sundry Creditors
- All 10 `vchtype` rows (incl. Bilty + Freight Journal)
- Two system ledgers: `Sales`, `Freight Expense`
- 5 branches · 5 zones · 5 owners · 3 agents · 5 items · 8 destinations
- 6 consignor ledgers (Sundry Debtors) + 6 vehicle ledgers (Vehicles group)
- No bilties, no ledger entries, no freight memos — clean transactional state.

## 2. Upload everything (single drop)

Upload **every file and folder** at this level into `public_html/`,
EXCEPT `database/` and `README-DEPLOY.md`:

- `.htaccess`
- `index.html`
- `metadata.json`
- `_expo/` (whole folder)
- `assets/` (whole folder)
- `backend/` (whole folder — includes `.env` and `ecosystem.config.js`)

> Easiest: in cPanel File Manager, upload `deploy.zip` (sibling of this
> README), extract it into `public_html/`, then delete the zip. The
> `database/` and `README-DEPLOY.md` are excluded from the zip — they
> stay on your laptop.

> Do NOT upload `backend/node_modules` from your laptop — install fresh
> on the server (next step).

## 4. Install backend deps (SSH)

```bash
cd ~/public_html/backend
npm install --omit=dev
mkdir -p logs
```

`--omit=dev` skips test/lint deps, keeps the install lean.

## 5. Start the backend with PM2

```bash
cd ~/public_html/backend
pm2 start ecosystem.config.js
pm2 save                  # persists the process list across reboots
pm2 startup               # one-time: prints a command — run it to enable boot start
pm2 logs ablogistics-api  # tail logs to confirm "[backend] listening on :3009"
```

If PM2 isn't installed:
```bash
npm install -g pm2
```

## 6. Smoke test

From your laptop:

```bash
# Health
curl -i https://ablogistics.abstechnologies.org.in/

# API via the .htaccess proxy
curl -s -X POST https://ablogistics.abstechnologies.org.in/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@1234"}'
```

Should return `{"user":{...},"accessToken":"..."}` with HTTP 200.

Then open the site in a browser:

> https://ablogistics.abstechnologies.org.in/

Log in with `admin` / `Admin@1234`. You should land on the Dashboard.

## Troubleshooting

- **502 / blank page on /api/...** — Apache mod_proxy isn't loaded, or PM2
  died. Check `pm2 status`. If mod_proxy is missing, contact host support
  to enable `mod_proxy` + `mod_proxy_http`. Alternative: use cPanel's
  "Setup Node.js App" (Phusion Passenger) and remove the proxy lines
  from `.htaccess`.

- **CORS errors in the browser** — the `.env` `FRONTEND_URL` must EXACTLY
  match the origin (scheme + host + port). For this deploy it's
  `https://ablogistics.abstechnologies.org.in` (no trailing slash, no port).
  Restart PM2 after editing: `pm2 restart ablogistics-api`.

- **Login returns 401** — admin password mismatch. The seed dump bakes in
  `Admin@1234`. If you want a different password, run on the server:
  ```bash
  cd ~/public_html/backend
  node scripts/seed-admin.js  # will skip if admin exists
  # OR change password via the Users page after logging in
  ```

- **Frontend loads but every API call 404s** — verify the rewrite rule:
  in `.htaccess`, `RewriteRule ^api/(.*)$ http://127.0.0.1:3009/api/$1 [P,L]`
  must be the FIRST rewrite (above the SPA fallback). And the Node app must
  actually be listening on 3009 — `curl http://127.0.0.1:3009/api/auth/login`
  from SSH.

- **Refresh-token cookie not sticking** — the cookie is `Secure; SameSite=None`
  in production. It only sets over HTTPS. If your cPanel domain hasn't issued
  a Let's Encrypt cert yet, login will appear to succeed but the next request
  will 401. Verify the lock icon in the browser before reporting a bug.

## Updating later

Frontend changes only:
1. `EXPO_PUBLIC_API_URL='' npx expo export --platform web` (in `frontend/`)
2. Replace `public_html/_expo/` and `public_html/index.html` from the new `dist/`.

Backend changes only:
1. Upload changed files under `public_html/backend/src/`
2. `pm2 restart ablogistics-api`

Schema changes:
1. Run the migration SQL via phpMyAdmin
2. Restart backend so any cached IDs (system ledgers, vchtypes) refresh:
   `pm2 restart ablogistics-api`
