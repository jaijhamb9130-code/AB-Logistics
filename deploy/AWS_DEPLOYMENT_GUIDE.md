# AB Logistics — AWS Deployment Guide (RDS + Elastic Beanstalk)

This guide takes you from an empty AWS account to a live app. Your repo already
contains the deploy automation (`.github/workflows/deploy.yml`,
`.ebextensions/nginx.config`, `Procfile`). You only need to create the AWS
resources below and wire up the GitHub secrets.

**Pick ONE region and use it everywhere** (RDS, EB, S3, IAM region setting).
Recommended for India: `ap-south-1` (Mumbai).

---

## Architecture

```
GitHub push (master)
      │
      ▼
GitHub Actions  ──build frontend + backend──►  S3 bundle  ──►  Elastic Beanstalk
                                                                    │
                                              nginx :80 ──┬── /api/* → Node :8080
                                                          └── /*     → frontend/dist (static)
                                                                    │
                                                                    ▼
                                                              RDS MySQL :3306
```

---

## STEP 1 — Create the RDS MySQL database

1. AWS Console → **RDS** → **Create database**.
2. **Standard create** → Engine: **MySQL** (8.0.x).
3. Template: **Free tier** (or Dev/Test). 
4. Settings:
   - DB instance identifier: `ab-logistics-db`
   - Master username: `admin`
   - Master password: set a strong one — **save it**, it becomes `DB_PASSWORD`.
5. Instance: `db.t3.micro` (free tier) or `db.t4g.micro`.
6. Storage: 20 GB gp3, leave autoscaling on.
7. **Connectivity** (important):
   - VPC: default VPC.
   - Public access: **No** (EB will reach it privately). If you want to import
     the schema from your laptop directly, temporarily set **Yes**, then flip
     back to No after import.
   - VPC security group: **Create new** → name it `ab-logistics-rds-sg`.
8. Additional config → **Initial database name**: `ab_logistics`  ← this becomes `DB_NAME`.
9. Create database. Wait ~5–10 min until status = **Available**.
10. Copy the **Endpoint** (e.g. `ab-logistics-db.xxxx.ap-south-1.rds.amazonaws.com`)
    → this is `DB_HOST`.

---

## STEP 2 — Load the schema + data into RDS

Use the bundled SQL file `deploy/ab_logistics_import.sql`.

**Option A — from your laptop (set RDS Public access = Yes temporarily):**
First add your IP to the RDS security group (Step 3 covers the SG; for a quick
import add an inbound rule: MySQL/3306 from *My IP*). Then:

```powershell
mysql -h <DB_HOST> -u admin -p ab_logistics < deploy/ab_logistics_import.sql
```
(Install MySQL client, or use MySQL Workbench / DBeaver → run the SQL file.)

**Option B — keep RDS private, import via the EB instance later** (after Step 5)
by SSH'ing into the EB EC2 box and running the same `mysql` command against the
private endpoint.

After import, set RDS **Public access back to No** and remove your laptop IP rule.

---

## STEP 3 — Security groups (let EB talk to RDS)

You will have two security groups after Step 5:
- `ab-logistics-rds-sg` — attached to RDS.
- The EB environment's auto-created SG (named like `awseb-e-xxxx-...`).

Wire them up **after EB exists**:
1. EC2 → **Security Groups** → open `ab-logistics-rds-sg`.
2. **Inbound rules → Edit → Add rule**:
   - Type: **MySQL/Aurora** (port 3306)
   - Source: **Custom** → start typing `awseb` and select the EB environment's
     security group. (This allows only EB to reach the DB — not the public.)
3. Save. Remove any temporary "My IP" rule once import is done.

---

## STEP 4 — IAM: permissions for GitHub Actions

The pipeline deploys using an IAM user's access keys.

1. IAM → **Users → Create user** → name `github-actions-deployer`.
   - Do **not** give console access (programmatic only).
2. **Attach policies directly**. For simplicity attach these AWS-managed policies:
   - `AdministratorAccess-AWSElasticBeanstalk`
   - `AmazonS3FullAccess`  (or scope to your deploy bucket — see below)
3. Create the user → open it → **Security credentials → Create access key** →
   use case **Application running outside AWS** → Create.
   - Copy **Access key ID** → `AWS_ACCESS_KEY_ID`
   - Copy **Secret access key** → `AWS_SECRET_ACCESS_KEY` (shown once — save it)

> Tighter least-privilege S3 policy (optional) — restrict to the deploy bucket:
> ```json
> {
>   "Version": "2012-10-17",
>   "Statement": [{
>     "Effect": "Allow",
>     "Action": ["s3:PutObject","s3:GetObject","s3:ListBucket"],
>     "Resource": [
>       "arn:aws:s3:::ab-logistics-deploy-bucket",
>       "arn:aws:s3:::ab-logistics-deploy-bucket/*"
>     ]
>   }]
> }
> ```

**EB also needs two service roles** (AWS usually auto-creates these the first
time you use EB; if not, create them in IAM → Roles):
- `aws-elasticbeanstalk-service-role` (trust: elasticbeanstalk.amazonaws.com)
- `aws-elasticbeanstalk-ec2-role` → instance profile, attach managed policies:
  `AWSElasticBeanstalkWebTier`, `AWSElasticBeanstalkWorkerTier`,
  `AWSElasticBeanstalkMulticontainerDocker`.

---

## STEP 5 — Create the S3 bundle bucket

1. S3 → **Create bucket** → name `ab-logistics-deploy-bucket` (must be globally
   unique; add a suffix if taken). Same region as everything else.
2. Keep "Block all public access" **ON** (the bundle is private).
3. This bucket name → `EB_S3_BUCKET`.

---

## STEP 6 — Create the Elastic Beanstalk application + environment

1. Elastic Beanstalk → **Create application**.
   - Application name: `AB-Logistics`  → this is `EB_APP_NAME`.
2. Environment:
   - Environment tier: **Web server environment**.
   - Environment name: `AB-Logistics-env`  → this is `EB_ENV_NAME`.
   - Platform: **Node.js** → latest Node.js 20 on Amazon Linux 2023.
   - Application code: **Sample application** for now (the GitHub pipeline will
     push the real bundle).
3. **Presets**: Single instance (free-tier friendly) — avoids a load balancer
   cost. You can switch to Load balanced later when you add HTTPS.
4. Service role / EC2 instance profile: pick the roles from Step 4 (or let EB
   create them).
5. Create environment. Wait until **Health = OK** (sample app live).

### Set EB environment variables

EB → your environment → **Configuration → Updates, monitoring, and logging →
Environment properties** (or "Software" section) → add each:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `DB_HOST` | RDS endpoint from Step 1 |
| `DB_PORT` | `3306` |
| `DB_USERNAME` | `admin` |
| `DB_PASSWORD` | your RDS master password |
| `DB_NAME` | `ab_logistics` |
| `JWT_ACCESS_SECRET` | long random string |
| `JWT_REFRESH_SECRET` | different long random string |
| `JWT_ACCESS_TTL` | `15m` |
| `JWT_REFRESH_TTL` | `7d` |
| `FRONTEND_URL` | `http://<EB-environment-URL>` (the eb domain) |
| `COOKIE_SECURE` | `false` (HTTP) — set `true` only after you add HTTPS |
| `COMPANY_STATE` | your company's home state, exactly as stored in ledger_master.state |

> Generate secrets (PowerShell):
> `[Convert]::ToBase64String((1..48 | % {Get-Random -Max 256}))`

> Note: EB's Node platform sets `PORT=8080` automatically, and the nginx config
> proxies `/api/` to `127.0.0.1:8080`. Don't override `PORT`.

Apply — the environment restarts.

---

## STEP 7 — Add GitHub repository secrets

GitHub repo → **Settings → Secrets and variables → Actions → New repository
secret**. Add all six (names must match `deploy.yml` exactly):

| Secret | Value |
|--------|-------|
| `AWS_ACCESS_KEY_ID` | from Step 4 |
| `AWS_SECRET_ACCESS_KEY` | from Step 4 |
| `AWS_REGION` | e.g. `ap-south-1` |
| `EB_S3_BUCKET` | `ab-logistics-deploy-bucket` |
| `EB_APP_NAME` | `AB-Logistics` |
| `EB_ENV_NAME` | `AB-Logistics-env` |

---

## STEP 8 — Deploy

The workflow triggers on push to `master` **and** via manual dispatch.

- **Manual:** GitHub → **Actions → Deploy to Elastic Beanstalk → Run workflow**.
- **Auto:** push a commit to `master`.

Watch the Actions log. On success, open the EB environment URL — the app loads,
and `/api/health` should return `{ "ok": true }`.

---

## STEP 9 — Verify

1. Visit `http://<EB-URL>/api/health` → `{ ok: true, ts: ... }`.
2. Visit `http://<EB-URL>/` → frontend loads.
3. Log in. If login fails on the cookie refresh, confirm `COOKIE_SECURE=false`
   (you're on HTTP) and `FRONTEND_URL` matches the EB domain.

---

## STEP 10 (Optional but recommended) — HTTPS

Cookies for refresh-token auth are far safer over HTTPS.

1. Switch the EB environment to **Load balanced** (Configuration → Capacity).
2. **ACM** (Certificate Manager) → request a public cert for your domain
   (needs a domain in Route 53 or your DNS provider).
3. EB → Configuration → **Load balancer** → add HTTPS:443 listener → select the
   ACM cert.
4. Point your domain (Route 53 / DNS CNAME) at the EB load balancer URL.
5. Flip EB env var `COOKIE_SECURE=true`, and update `FRONTEND_URL` to `https://...`.
6. In `backend/src/app.js`, re-enable `hsts`, `contentSecurityPolicy`, and the
   COOP/COEP helmet options (currently disabled for HTTP-only).

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| EB health = Severe, logs show `ECONNREFUSED 3306` or timeout | RDS security group missing the EB SG inbound rule (Step 3), or wrong `DB_HOST`. |
| 502 Bad Gateway | Node app crashed on boot — check EB → Logs. Usually a missing env var. |
| Login works but refresh fails | `COOKIE_SECURE=true` on HTTP, or `FRONTEND_URL` mismatch. |
| GitHub Action fails at S3 upload | IAM user lacks S3 perms or wrong `EB_S3_BUCKET`/region. |
| `create-application-version` access denied | IAM user missing the Elastic Beanstalk policy (Step 4). |
| Frontend 404s on refresh of a deep route | nginx `try_files` fallback — already handled in `.ebextensions/nginx.config`. |

---

## Cost note (free-tier-ish)

- RDS `db.t3.micro` + EB single `t3.micro` EC2 are free-tier eligible for 12
  months. S3 bundle storage is pennies. A load balancer (HTTPS step) is ~$16/mo,
  so stay single-instance until you need TLS/custom domain.
