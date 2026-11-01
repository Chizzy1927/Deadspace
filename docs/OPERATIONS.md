# Database operations

Migrating, seeding and running the app are **three separate operations**. The API never migrates or
seeds on startup (`npm run start -w apps/api` only runs `node dist/server.js`).

| Operation | Command                     | Changes                                              | Safe to repeat               |
| --------- | --------------------------- | ---------------------------------------------------- | ---------------------------- |
| Migrate   | `npm run db:deploy`         | Applies pending migrations (`prisma migrate deploy`) | Yes: "No pending migrations" |
| Seed      | `npm run db:seed`           | Inserts missing truck-leg days; upserts warehouses   | Yes (see below)              |
| Run       | `npm run start -w apps/api` | Nothing in the database schema/data                  | n/a                          |

`db:migrate` (`prisma migrate dev`) is for local development only and must never be pointed at production.

`npm run db:status -w apps/api` is a fourth, **read-only** command: it prints seeded and user-created row counts and how much
seeded transport inventory is left (`-- --json` for machine output, `-- --expect-no-public-supply` to exit 1 if any
user-created truck leg or warehouse space exists). Deploying and smoke-testing the public demo is covered in
[DEPLOYMENT.md](DEPLOYMENT.md).

## Connection strings

- `DATABASE_URL`: used by the running API and by the seed. In production this is the host's **pooled** URL.
- `DIRECT_DATABASE_URL` (optional): used **only** by the Prisma CLI (`db:deploy`, `db:drift`). When set and
  non-blank it wins over `DATABASE_URL` (`apps/api/prisma.config.ts`); the app never reads it. Set it
  when `DATABASE_URL` is a pooled endpoint, because migrations should use a direct connection.
- Locally and in CI only `DATABASE_URL` is set, so nothing changes there.

Environment variables already set in your shell override the repo-root `.env`. Credentials belong in the
host's secret store or, for a one-off command, in the current shell session. Never commit them or put them
in `.env.example`.

## Migrations

Production runs `npm run db:deploy` as the Render pre-deploy command, before the new version starts. If it
fails the deploy fails and the previous version keeps serving. The first migration runs
`CREATE EXTENSION IF NOT EXISTS postgis`, so the database role needs permission to create it. Write
migrations so the previous app version still works on the new schema (add first, remove later), because
rolling the app back does not roll the schema back.

## Initial production seed (manual, once)

Run from a trusted machine, after the first `db:deploy` has succeeded:

1. In a fresh shell, set `DATABASE_URL` to the production **direct** (non-pooled) URL for this session only.
2. Run `npm run db:deploy` first and read the `Datasource ... at <host>` line it prints. It must be the
   production host. If it names `localhost`, stop: the variable was not picked up.
3. Run `npm run db:seed`. Expect a line like `Truck legs: 1296 over 48 departure days, 1296 newly inserted,
0 already present. Warehouse spaces: 17 upserted.`
4. Close the shell.

The seed never deletes, never touches rows created through the app, and always uses the offline mock
geocoder.

### The 45-day transport seed horizon

Truck legs are seeded **per departure day**, so the transport demo keeps working as days pass without a
scheduler:

- The layout in `apps/api/prisma/seed-data/truck-legs.ts` is 30 fictional carrier movements. The database
  holds one row per movement per departure day. A row's id embeds its departure date and the movement's key
  (`seed-truck-leg-20261112-01`), and every value is computed from that day and key alone, so a row is
  identical on every run.
- 24 movements run **daily**. The 6 that the standard demo request can match (the dry-van Dallas to Houston
  carriers and their feeders) run on alternate days: three on even days and three on odd days, counted in
  days since the Unix epoch. The demo's pickup window is 32 hours wide and always spans one even and one
  odd day, so it shows each of those carriers exactly once and never a duplicate copy, while every single
  day still has dry-van, reefer and flatbed corridor inventory. That is 27 rows per day.
- A seed run creates every departure day from the seed day itself to 46 days after the seed anchor (the
  next UTC midnight after you seeded): 48 days, 1,296 rows. It only inserts rows that are missing. It
  never updates, moves or removes an existing row, so a request's historical matches do not change when
  you reseed.
- **The guarantee:** a visitor who opens the app up to 45 days after the seed anchor gets the full
  transport demo: the same six carriers, led by the same three. Any single-day corridor search from the
  seed day through the last seeded day finds inventory for every trailer type. After that it degrades in
  two steps: the next day only half of the six carriers remain, then nothing. This is measured by
  `apps/api/test/integration/seed-horizon.test.ts` for both calendar parities.
- A request whose pickup window lies beyond the seeded days saw no inventory when it was made and would
  match newly seeded days later. Requests inside the seeded range never change.
- Warehouse spaces are unchanged: fixed ids, upserted and re-dated on every seed. Their windows are long
  (the storage demo stayed usable for about 60 days in testing).

#### When to reseed

Run the same seed procedure again (it only adds the missing future days and re-dates the warehouses)
whenever the remaining horizon drops below about 14 days, and before an important demo if unsure. Seeding
about monthly keeps a comfortable margin. Reseeding the same day is harmless and inserts nothing.

#### Recognising that the horizon is running out

Run `npm run db:status -w apps/api` (read-only; it prints the date and the days of full demo left), or check the newest
seeded departure day L directly:

```sql
SELECT max("departureEarliest")::date AS latest_seeded_departure
FROM "TruckLeg" WHERE id LIKE 'seed-truck-leg-%';
```

The full demo works for visitors through the end of the UTC day L minus 2 days, half of it through the end
of L minus 1 day, and nothing after. Reseed when L is less than about 14 days away. Symptoms of
exhaustion: the transport example returns three matches and then none, while the storage example still
works. The public smoke test (Checkpoint 5) should assert that the deployed transport example returns six
matches.

#### Old rows are kept

Past departure days are intentionally retained, so old requests still resolve to the inventory they saw.
They grow the table by 27 legs per calendar day (about 810 a month). Automatic cleanup is not built. If it
is ever needed, remove only legs that departed long ago, accepting that requests older than the cutoff may
then show fewer matches:

```sql
DELETE FROM "TruckLeg"
WHERE id LIKE 'seed-truck-leg-%' AND "departureLatest" < now() - interval '90 days';
```

#### Local databases seeded before departure days

Earlier versions seeded 31 legs with ids like `seed-truck-leg-01`. They are not replaced by the new rows,
so a development database that was seeded before this change still holds them (production never did).
They are harmless but stale; remove them with:

```sql
DELETE FROM "TruckLeg" WHERE id ~ '^seed-truck-leg-[0-9]{2}$';
```

## Manual recovery and reset

Only needed if the public demo accumulates junk. There is no automated reset in V1.

1. Optional safety net: in the Neon console create a branch of the production branch (the Free plan's
   history window is only a few hours, so branch first).
2. Remove everything not created by the seed (there are no seed requests, and no foreign keys):

   ```sql
   DELETE FROM "TransportRequest";
   DELETE FROM "StorageRequest";
   DELETE FROM "TruckLeg" WHERE id NOT LIKE 'seed-%';
   DELETE FROM "WarehouseSpace" WHERE id NOT LIKE 'seed-%';
   ```

3. Re-run `npm run db:seed` to restore the warehouse rows to `ACTIVE`, refresh their dates, and add any
   missing truck-leg days. Existing truck legs are never modified, so a seeded leg that was changed by
   hand is not restored by reseeding: delete it first (it will then be re-inserted).

For a full rebuild, create a new empty database, run `npm run db:deploy`, then `npm run db:seed`.
