# DeadSpace

B2B marketplace for **stranded logistics capacity**: empty/part-empty truck legs a carrier is
already planning, and genuinely idle warehouse space. Shippers submit a transport or storage need
and receive ranked, explainable matches. V1 = trucks + warehouses only.
Full design: `docs/ARCHITECTURE.md` (read only the section a task needs).

## Product boundary (do not drift)

- DeadSpace is NOT a generic load board. Every truck listing (`TruckLeg`) is a specific planned
  movement with a required origin, destination, and bounded departure window. Do not add
  "truck available anywhere" posts or shipper loads that carriers browse.
- Warehouse listings (`WarehouseSpace`) model idle capacity: quantity, availability window,
  minimum duration, pricing basis.

## Architecture

- npm-workspaces TypeScript monorepo: `apps/web` (React + Vite SPA), `apps/api` (Express REST),
  `packages/shared` (Zod schemas, enums, DTOs, the single source of truth for validation on
  client and server).
- PostgreSQL + PostGIS via Prisma. Raw SQL only in `apps/api/src/repositories/geo.repository.ts`.
- API layering: routes (parse/validate) → services → repositories. Keep routes thin.
- Explicit domain tables (TruckLeg, TransportRequest, WarehouseSpace, StorageRequest). No polymorphic "capacity" table.

## Matching engine (`apps/api/src/matching/`)

- Pure, deterministic functions: no DB, HTTP, clock, randomness, or vendor imports. Inputs are
  plain objects with precomputed distances (from PostGIS); outputs include score, breakdown,
  metrics, and human-readable reasons.
- Feasibility is enforced by hard constraints first; only feasible matches are ranked.
  Route efficiency is the dominant truck ranking signal.
- All weights/thresholds live in `matching/config.ts`. They are tunable heuristic defaults.
  Never describe them as optimal or scientific.
- Road distances are straight-line × ROAD_FACTOR estimates: name fields `est*` and label "est." in the UI.

## Geocoding

- Vendor-neutral `Geocoder` interface. Geoapify-specific code lives only in `geocoding/geoapify.ts`.
  Store only label/lat/lng (+ provider name), never vendor payloads. Tests use `MockGeocoder`.

## Conventions

- TypeScript strict; no `any`, `@ts-ignore`, or blanket `eslint-disable` without a commented reason.
- Prettier + ESLint are enforced (a hook formats files after every edit).
- Validate all external input with shared Zod schemas. API errors: `{ error: { code, message, details? } }`.
- Small, focused commits on feature branches; never commit secrets or `.env`.
- Landing/marketing copy: no numerical claims without a real, linked source.
- No auth in V1. Unguessable cuid URLs are a demo convenience. Never call them security or access control.

## Commands

`npm run dev` · `npm run lint` · `npm run typecheck` · `npm test` (unit) ·
`npm run test:integration` (needs `docker compose up -d`) · `npm run build` ·
`npm run db:migrate` · `npm run db:seed`

## Testing & verification

- Matching logic changes require unit tests; endpoint changes require integration tests.
- Verify, don't assume: run the relevant checks (use the `verify` skill after meaningful work)
  and report actual results. If something wasn't run (e.g. DB unavailable), say so.
- Never weaken, skip, delete, or loosen tests/assertions/thresholds just to make them pass. If a
  test is genuinely wrong, explain why and change it explicitly in the open.
- A Stop hook runs typecheck, lint, and unit tests on changed code. If it blocks, fix the root
  cause; if you can't, stop and report the failure plainly.

## Context efficiency

- Read only task-relevant files; no repo-wide scans without a specific reason. Prefer targeted
  searches, diffs, file sections, and short error excerpts over full files, logs, or test output.
- Don't reread `docs/ARCHITECTURE.md` by default. Don't restate what CLAUDE.md, the repo, or Git
  history already record.
- Iterate with focused tests for the area being changed; run the full `verify` skill at completion
  points. Never weaken verification to save tokens.
- The repo is the project memory: instructions → CLAUDE.md, architecture → docs/ARCHITECTURE.md,
  expected behaviour → tests, completed work → commits. Work must be resumable after `/clear` from these alone.

## Working style

- Split phases into focused sub-tasks (e.g. data/repository, matching, API, frontend, verification);
  don't over-fragment trivial work.
- When a phase is complete and verified, say it's a good point to `/clear`.
- Keep reports concise: what changed, what was verified, failures/blockers, decisions needed.
- Flag tasks routine enough for a cheaper/faster model and tasks that need stronger reasoning;
  never switch models without approval.

## V1 out of scope (discuss before introducing)

Containers/intermodal, multi-stop routing or load consolidation, auth/accounts, booking/payments,
messaging/notifications, routing APIs or live maps, ML/dynamic pricing, emissions claims,
stored matches/background jobs/Redis, microservices/GraphQL/SSR, new runtime dependencies of
significant size, and any change to the product boundary above.
