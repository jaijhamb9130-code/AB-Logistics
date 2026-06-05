# ─────────────────────────────────────────────────────────────────────────────
# AB Logistics — cPanel deployment packager
#
# Produces two zips at the repo root:
#   ab-logistics-deploy.zip    → extract into public_html
#       .htaccess              (Apache mod_proxy: /api → 127.0.0.1:3009, SPA)
#       index.html + _expo/ + assets/ ...   (Expo web build, at root)
#       backend/               (Node API source — no node_modules)
#         .env                 (pre-written: DB creds, JWT, port 3009)
#         ecosystem.config.js  (pre-written PM2 config)
#   ab-logistics-database.zip  → import via phpMyAdmin (authoritative seed)
#
# cPanel steps: extract deploy zip → import DB zip → in backend/: npm install →
#               pm2 start ecosystem.config.js → pm2 save
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = 'Stop'
$root   = Split-Path -Parent $MyInvocation.MyCommand.Path
$stage  = Join-Path $root "_deploystage"
$out    = Join-Path $root "ab-logistics-deploy.zip"
$sqlOut = Join-Path $root "ab-logistics-database.zip"

$dist     = Join-Path $root "frontend\dist"
$srcCfg   = Join-Path $root "deploy-cpanel"           # authoritative .htaccess/.env/ecosystem/seed
$seedSql  = Join-Path $srcCfg "database\ablogistics_seed.sql"

# ── Preconditions ─────────────────────────────────────────────────────────────
if (-not (Test-Path (Join-Path $dist "index.html"))) {
  throw "Frontend build missing: $dist\index.html. Run 'npx expo export --platform web' in frontend/ first."
}
if (-not (Test-Path (Join-Path $srcCfg ".htaccess")))                 { throw "Missing $srcCfg\.htaccess" }
if (-not (Test-Path (Join-Path $srcCfg "backend\.env")))              { throw "Missing $srcCfg\backend\.env" }
if (-not (Test-Path (Join-Path $srcCfg "backend\ecosystem.config.js"))) { throw "Missing $srcCfg\backend\ecosystem.config.js" }
if (-not (Test-Path $seedSql))                                        { throw "Missing $seedSql" }

# ── Clean slate ───────────────────────────────────────────────────────────────
if (Test-Path $stage)  { Remove-Item $stage -Recurse -Force }
if (Test-Path $out)    { Remove-Item $out   -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

# ── Frontend build → document root of the zip ─────────────────────────────────
Get-ChildItem -Path $dist |
  ForEach-Object { Copy-Item -Path $_.FullName -Destination $stage -Recurse -Force }

# ── .htaccess (mod_proxy + SPA) → root ────────────────────────────────────────
Copy-Item -Path (Join-Path $srcCfg ".htaccess") -Destination $stage -Force

# ── Backend (source only, no node_modules / config / dev-only files) ──────────
$backendDest  = Join-Path $stage "backend"
New-Item -ItemType Directory -Path $backendDest | Out-Null
$exclude = @("node_modules","tests","__tests__",".git",".env",".env.example",".gitignore",
             "jsconfig.json","tsconfig.json","Procfile","railway.toml","ecosystem.config.js","logs")
Get-ChildItem -Path (Join-Path $root "backend") |
  Where-Object { $exclude -notcontains $_.Name -and $_.Name -notlike "scratch_*" } |
  ForEach-Object { Copy-Item -Path $_.FullName -Destination $backendDest -Recurse -Force }

# Belt-and-suspenders: drop any dev scratch scripts / stray node_modules that
# slipped in via a nested copy.
Get-ChildItem -Path $backendDest -Recurse -Filter "scratch_*" -File -ErrorAction SilentlyContinue |
  Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem -Path $backendDest -Recurse -Directory -Filter "node_modules" -ErrorAction SilentlyContinue |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

# Pre-written runtime config (authoritative copies).
Copy-Item -Path (Join-Path $srcCfg "backend\.env")               -Destination $backendDest -Force
Copy-Item -Path (Join-Path $srcCfg "backend\ecosystem.config.js") -Destination $backendDest -Force
# PM2 log target referenced by ecosystem.config.js.
New-Item -ItemType Directory -Path (Join-Path $backendDest "logs") -Force | Out-Null

# ── Zip the deploy bundle ─────────────────────────────────────────────────────
Compress-Archive -Path "$stage\*" -DestinationPath $out -CompressionLevel Optimal
Remove-Item $stage -Recurse -Force

# ── Database zip (authoritative seed only) ────────────────────────────────────
if (Test-Path $sqlOut) { Remove-Item $sqlOut -Force }
$sqlStage = Join-Path $root "_sqlstage"
if (Test-Path $sqlStage) { Remove-Item $sqlStage -Recurse -Force }
New-Item -ItemType Directory -Path $sqlStage | Out-Null
Copy-Item -Path $seedSql -Destination (Join-Path $sqlStage "ablogistics_seed.sql") -Force
Compress-Archive -Path "$sqlStage\*" -DestinationPath $sqlOut -CompressionLevel Optimal
Remove-Item $sqlStage -Recurse -Force

# ── Report ────────────────────────────────────────────────────────────────────
$depMB = [math]::Round((Get-Item $out).Length / 1MB, 2)
$sqlKB = [math]::Round((Get-Item $sqlOut).Length / 1KB, 1)
Write-Host ""
Write-Host "OK  Deploy zip:   $out  ($depMB MB)"
Write-Host "OK  Database zip: $sqlOut  ($sqlKB KB)"
