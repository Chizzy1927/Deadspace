# Deployment runbook

DeadSpace runs as **one Render web service** (Express serving both `/api` and the built web app) in front of
**one Neon Postgres 17 + PostGIS database**. The service is defined in [`render.yaml`](../render.yaml). Database
operations (migrate, seed, reset) are in [OPERATIONS.md](OPERATIONS.md).

Cost: Render plan `0.5c-512mb` (formerly "Starter") is **$7 a month** (render.com/pricing, checked 2026-11-01), always on,
billed per second; the Hobby workspace itself is $0. Included with the Hobby workspace: **5 GB of outbound bandwidth a month**
(overage $0.15 per GB when a payment method is on file; without one Render spins the services down until next month) and 500
build minutes (overage $5 per 1,000). The built web bundle is roughly 175 KB gzipped, so ordinary demo traffic is far below 5 GB,
but a crawler or bot flood would be billed: check the Render usage page after sharing the link widely. Neon Free is $0 and needs
no card.

## Rules that must not be broken

- **Never paste, print, commit or share a connection string.** Type them only into Neon/Render fields and into your
  own shell. Reports may say "the Neon host" but not the host name or any password.
- Migration and seeding are explicit operations. Nothing migrates at startup and nothing seeds automatically.
- A red CI run means no merge and no deploy. Never weaken a test or bypass CI to get a deploy through.
- Public truck and warehouse creation stays off (`DEMO_LISTING_CREATION=false`).

## Environment (Render)

All of these are set by `render.yaml` except the two secrets, which Render asks you for when you create the Blueprint.

| Variable                    | Value               | Secret | Notes                                                                                         |
| --------------------------- | ------------------- | ------ | --------------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | Neon **pooled** URL | yes    | Runtime. Host contains `-pooler`. Missing: the API exits at startup.                          |
| `DIRECT_DATABASE_URL`       | Neon **direct** URL | yes    | Pre-deploy migrations only (the Prisma CLI prefers it). Missing: falls back to pooled.        |
| `NODE_VERSION`              | `24`                | no     | Build.                                                                                        |
| `NODE_ENV`                  | `production`        | no     |                                                                                               |
| `TRUST_PROXY`               | `1`                 | no     | Client IP for rate limits. Missing: all visitors share one bucket.                            |
| `DEMO_LISTING_CREATION`     | `false`             | no     | Missing: public supply creation would be ON.                                                  |
| `WRITE_RATE_LIMIT_PER_HOUR` | `30`                | no     | Per visitor IP, per create route.                                                             |
| `MAX_ROWS_PER_TABLE`        | `5000`              | no     | Refuses new rows past this size.                                                              |
| `GEOCODER`                  | `mock`              | no     | No vendor key.                                                                                |
| `VITE_API_URL`              | **never set**       | n/a    | Unset means the production build calls same-origin `/api`. Setting it, even empty, overrides. |
| `WEB_ORIGIN`                | optional            | no     | Public URL; unused in production (same origin). Can be added after you know the URL.          |

`PORT` is provided by Render (10000). Do not set it. `GEOAPIFY_API_KEY`, `WEB_DIST_DIR`, `SEED_ANCHOR` and
`TEST_DATABASE_URL` are not used in production.

## First deployment, in order

Prerequisites: the Phase 6 pull request is merged to `main` with CI green, and `render.yaml` is on `main`.
For the smoke test, once per machine: `npx playwright-core install chromium`.

### 1. Create the Neon project (you)

In the Neon console create a project: **Postgres 17**, region **AWS US East (Ohio)** (to match Render's Ohio
region; the region cannot be changed later). Open **Connect** and copy two strings: the **direct** one
(Connection pooling off) and the **pooled** one (on; the host contains `-pooler`). Keep both private.

### 2. First migration and seed, from your machine (you)

Do this _before_ creating the Render service, so the site never serves an empty database and the first Render
pre-deploy is a harmless no-op that proves the mechanism. In a fresh shell:

```powershell
$env:DIRECT_DATABASE_URL = Read-Host "Neon DIRECT url"   # paste when prompted
$env:DATABASE_URL = $env:DIRECT_DATABASE_URL            # migration and seed use the direct URL
npm run db:deploy      # the "Datasource ... at <host>" line must be the Neon host; 2 migrations applied
npm run db:seed        # expect: Truck legs: 1296 over 48 departure days, 1296 newly inserted ...
npm run db:status -w apps/api -- --expect-no-public-supply
```

(bash: `read -rs DIRECT_DATABASE_URL; export DIRECT_DATABASE_URL DATABASE_URL="$DIRECT_DATABASE_URL"`.)
If `db:deploy` fails, stop: do not seed. `db:deploy` creating the PostGIS extension is the first proof that the
role can do it. Close the shell afterwards.

### 3. Create the Render service (you)

Render dashboard: **New > Blueprint**, connect GitHub, choose the repository and branch `main`. Render reads
`render.yaml`. Check the price shown, region Ohio and plan `0.5c-512mb`. When asked for the two secrets, paste the
**pooled** URL into `DATABASE_URL` and the **direct** URL into `DIRECT_DATABASE_URL`. Confirm. The service name
decides the URL (`https://<name>.onrender.com`); a taken name gets a suffix.

Behaviour to expect (render.com/docs/deploys, /docs/infrastructure-as-code): the Blueprint creates only this one web service (no
Render database). Render does not say whether creating it also starts a first deploy, so assume it does: that is why Neon is
migrated and seeded first, making the first pre-deploy a no-op. `autoDeployTrigger: checksPass` then deploys a commit on `main`
only after all of its checks pass; a failing check, or **no checks detected**, means no deploy, and Render does not document how
long it waits for checks to appear. If a green merge to `main` produces no deploy, use **Manual Deploy > Deploy latest commit**
once CI is green. Later pushes that change `render.yaml` redeploy the service automatically (Blueprint auto sync).

### 4. Watch the first deploy

Expected in the logs: build (`npm ci`, build), pre-deploy `No pending migrations to apply`, then
`Serving web app from ...` and `DeadSpace API listening on port 10000`. Then `GET <url>/api/health` must be 200 with a
`postgisVersion`. Stop if it is not.

### 5. Smoke test and data check

```powershell
# Shell with DIRECT_DATABASE_URL set as in step 2:
npm run db:status -w apps/api -- --json > before.json     # then delete the file afterwards
npm run smoke:public -- https://<name>.onrender.com
npm run db:status -w apps/api -- --expect-no-public-supply
```

The smoke script must end `0 failed` and print `SMOKE_CREATED transportRequests=N storageRequests=M`. After it,
the request counts must have risen by exactly N and M, and `db:status` must report **zero** user-created truck
legs and warehouse spaces (it exits 1 otherwise).

## What the smoke test checks

Against the URL you give it, with Chromium on desktop and at 390 px:

- `/api/health` (200 with PostGIS version), `/api/livez`, `/api/demo-config` (listing creation off).
- An unknown `/api/...` route is a JSON 404; an unknown asset is a 404 and not the SPA shell.
- `robots.txt` disallows all; `X-Robots-Tag: noindex` on the page and the API.
- `POST /api/truck-legs` and `/api/warehouse-spaces` are refused with 403.
- Landing page, demo banner and the "About the demo data" section; a deep link and a hard refresh; the in-app not-found page.
- Transport example returns at least 3 matches, each tagged "Sample data", with no `mailto:` link; hard refresh of the results.
- Storage example returns at least 2 tagged matches; an out-of-market request shows the limited-coverage explanation.
- Truck and warehouse forms show the "turned off" notice, still validate, say nothing was stored and send no create request.
- No console errors, failed requests or 4xx/5xx responses on the successful journeys; no horizontal overflow at 390 px.
- Forged `X-Forwarded-For` values cannot dodge the rate limit.

## Stop conditions

| Situation           | Do                                                                        |
| ------------------- | ------------------------------------------------------------------------- |
| CI red              | Do not merge or deploy. Fix on the branch.                                |
| Migration fails     | Do not seed. Fix forward; nothing is serving yet.                         |
| Seed fails          | Production is not ready. Rerun (idempotent) or recreate the Neon project. |
| `/api/health` fails | Stop before the browser smoke test. Read the Render logs.                 |
| Smoke test fails    | Phase 6 is not complete. Fix, redeploy, rerun the whole smoke test.       |
| Supply rows appear  | Suspend the service, then investigate before anything else.               |

## Rollback and recovery

- **Bad deploy:** Render dashboard, **Rollback** to the previous deploy (reuses its build; turns auto-deploy off, so re-enable it
  after the fix). Or fix forward with a pull request. A rollback does not undo a database migration.
- **Bad migration:** the pre-deploy step fails and the previous version keeps serving. Keep migrations additive. Neon Free keeps only
  a few hours of history, so create a Neon branch before any data-changing migration.
- **Junk data:** the manual reset in [OPERATIONS.md](OPERATIONS.md).
- **Take it offline or stop paying:** suspend or delete the Render service. Neon Free does not bill.
- **Neon quota reached:** compute suspends or writes block; data is kept until the next month or an upgrade.
- **Keeping the demo fresh:** reseed before the seeded horizon runs out (`npm run db:status` shows the date; see OPERATIONS.md).

## Things to watch on the first deploy (not confirmable beforehand)

1. Pre-deploy finds the Prisma CLI (the build installs dev dependencies). If not, move `db:deploy` to the end of the build command.
2. Runtime on Neon's pooled endpoint works with the `pg` driver. Neon says to use pooled connections by default and that
   protocol-level prepared statements work through its pooler; `@prisma/adapter-pg` uses unnamed statements unless a
   `statementNameGenerator` is configured (we configure none), and Neon strings carrying `channel_binding=require` are accepted
   (`pg` ignores that parameter). If the smoke test still shows prepared-statement or connection errors, point `DATABASE_URL` at the
   direct URL instead.
3. **Rate-limit key (`TRUST_PROXY`).** Render's own article says all inbound traffic passes through Cloudflare and Render's load
   balancers (two proxies), but Render does not document the hop count. `TRUST_PROXY=1` is the fail-safe value: a forged header can
   never choose the bucket, but if two proxies are in front, the key is the Cloudflare edge address and nearby visitors share
   buckets. Prove what the key is, with no code change: the limiter's `RateLimit-Policy` header carries `pk=:<hash of the key>:`.
   ```
   curl -4 -s ifconfig.me        # your public IPv4 (any "what is my IP" site works; use IPv4 for both commands)
   curl -4 -s -D - -o /dev/null "https://<name>.onrender.com/api/geocode/search?q=dal" | grep -i ratelimit-policy
   node -e "const c=require('crypto');console.log(Buffer.from(c.createHash('sha256').update(process.argv[1]).digest('hex').slice(0,12)).toString('base64'))" YOUR.IPV4
   ```
   If the `pk` equals the printed hash, the limiter is keyed on your real address and `TRUST_PROXY=1` is correct. If not, it is keyed
   on a shared edge address: set `TRUST_PROXY=2` in Render and repeat both this comparison and the smoke test. `2` is only acceptable if
   the hashes match **and** the smoke test's forged-header check passes (with `2` and only one proxy a forged header would choose the
   bucket, and that check would fail).
4. The first request after five idle minutes wakes Neon (a fraction of a second to a few seconds). Load the site once before a demo.
5. Render's health check polls every few seconds. It uses `/api/livez` (no database) so Neon can still suspend; do not point it at
   `/api/health`, which would keep Neon awake all month and exhaust the free 100 compute-hours.
