# Database operations

Migrating, seeding and running the app are **three separate operations**. The API never migrates or
seeds on startup (`npm run start -w apps/api` only runs `node dist/server.js`).

| Operation | Command                     | Changes                                              | Safe to repeat               |
| --------- | --------------------------- | ---------------------------------------------------- | ---------------------------- |
| Migrate   | `npm run db:deploy`         | Applies pending migrations (`prisma migrate deploy`) | Yes: "No pending migrations" |
| Seed      | `npm run db:seed`           | Upserts the fictional demo inventory                 | Yes (see below)              |
| Run       | `npm run start -w apps/api` | Nothing in the database schema/data                  | n/a                          |

`db:migrate` (`prisma migrate dev`) is for local development only and must never be pointed at production.

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
3. Run `npm run db:seed`. Expect `Seeded 31 truck legs and 17 warehouse spaces`.
4. Close the shell.

What the seed does: it upserts rows with fixed ids (`seed-truck-leg-*`, `seed-warehouse-space-*`) in one
transaction, resets those rows to `ACTIVE`, and re-dates them from the next UTC midnight. It never deletes,
never touches rows created through the app, and always uses the offline mock geocoder.

### Seed data goes stale

Seeded trips and warehouse windows are dated relative to the moment you seed, so a database seeded more
than about a day ago can return no matches for the example searches. Re-run `npm run db:seed` (same
procedure) before showing the demo, until this is automated.

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

3. Re-run `npm run db:seed` to restore seed rows to `ACTIVE` and refresh their dates.

For a full rebuild, create a new empty database, run `npm run db:deploy`, then `npm run db:seed`.
