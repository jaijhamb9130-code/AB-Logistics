$root   = Split-Path -Parent $MyInvocation.MyCommand.Path
$stage  = Join-Path $root "_stage"
$out    = Join-Path $root "ab-logistics-deploy.zip"
$sqlOut = Join-Path $root "ab-logistics-database.zip"

# ── Clean slate ───────────────────────────────────────────────────────────────
if (Test-Path $stage)  { Remove-Item $stage -Recurse -Force }
if (Test-Path $out)    { Remove-Item $out   -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

# ── Frontend (dist → root, skip metadata.json) ───────────────────────────────
Get-ChildItem -Path "$root\frontend\dist" |
  Where-Object { $_.Name -ne "metadata.json" } |
  ForEach-Object { Copy-Item -Path $_.FullName -Destination $stage -Recurse }

# ── .htaccess ─────────────────────────────────────────────────────────────────
Copy-Item -Path "$root\deploy\.htaccess" -Destination $stage

# ── Backend (source only, no node_modules) ────────────────────────────────────
$backendDest = Join-Path $stage "backend"
New-Item -ItemType Directory -Path $backendDest | Out-Null

$excludeItems = @("node_modules", "tests", ".git", ".env", ".env.example", ".gitignore", "jsconfig.json", "tsconfig.json", "Procfile", "railway.toml", "ecosystem.config.js")

Get-ChildItem -Path "$root\backend" |
  Where-Object { $excludeItems -notcontains $_.Name } |
  ForEach-Object { Copy-Item -Path $_.FullName -Destination $backendDest -Recurse }

# ── Remove runtime-unnecessary backend folders ───────────────────────────────
$migrationsPath = Join-Path $backendDest "src\db\migrations"
if (Test-Path $migrationsPath) { Remove-Item $migrationsPath -Recurse -Force }

# ── Pre-written config files ──────────────────────────────────────────────────
Copy-Item -Path "$root\deploy\backend\.env"              -Destination $backendDest -Force
Copy-Item -Path "$root\deploy\backend\ecosystem.config.js" -Destination $backendDest -Force

# ── Zip it ────────────────────────────────────────────────────────────────────
Compress-Archive -Path "$stage\*" -DestinationPath $out -CompressionLevel Optimal

# ── Clean up staging folder ───────────────────────────────────────────────────
Remove-Item $stage -Recurse -Force

# ── SQL zip (schema only — import via phpMyAdmin) ─────────────────────────────
if (Test-Path $sqlOut) { Remove-Item $sqlOut -Force }
$sqlStage = Join-Path $root "_sqlstage"
if (Test-Path $sqlStage) { Remove-Item $sqlStage -Recurse -Force }
New-Item -ItemType Directory -Path $sqlStage | Out-Null
Copy-Item -Path "$root\deploy\ab_logistics_import.sql" -Destination "$sqlStage\ab_logistics_import.sql"
Compress-Archive -Path "$sqlStage\*" -DestinationPath $sqlOut -CompressionLevel Optimal
Remove-Item $sqlStage -Recurse -Force

Write-Host ""
Write-Host "✓ Created: $out"
Write-Host "✓ Created: $sqlOut"
Write-Host ""
Write-Host "Deployment structure:"
Write-Host "  .htaccess            <- Apache mod_proxy + SPA routing"
Write-Host "  index.html + assets  <- Expo web build"
Write-Host "  backend/             <- Node.js source (no node_modules)"
Write-Host "    .env               <- DB creds + JWT secrets pre-filled"
Write-Host "    ecosystem.config.js"
Write-Host ""
Write-Host "cPanel steps:"
Write-Host "  1. Extract ab-logistics-deploy.zip into public_html"
Write-Host "  2. Import ab-logistics-database.zip via phpMyAdmin"
Write-Host "  3. In terminal (inside backend/): npm install"
Write-Host "  4. node scripts/init-db.js   (creates tables + seeds admin)"
Write-Host "  5. pm2 start ecosystem.config.js"
Write-Host "  6. pm2 save"
Write-Host ""
Write-Host "Login: admin / Admin@1234"
