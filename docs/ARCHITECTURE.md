# DeadSpace — V1 Architecture (approved rev. 2)

## Context

Trucks often run empty or partly loaded on legs they are already planning to drive, such as return trips, repositioning moves, and the space left after a partial load. Warehouses pay for pallet positions and floor space that sit idle. DeadSpace is a B2B marketplace for that **stranded capacity**: carriers and warehouses list capacity that already exists, and shippers submit a need and get **ranked, explainable matches**. It is deliberately **not a generic load board**. Every truck listing is a specific planned movement with a fixed origin, destination and time window. V1 covers trucks and warehouses only, with no containers.

**Fixed decisions:** a separate SPA and REST API in a TypeScript monorepo; PostgreSQL with PostGIS; shared Zod schemas; deterministic, explainable matching written as pure, testable functions; explicit domain tables; match score breakdowns and reasons; tests and CI; no authentication in V1.

---

## 1. Tech stack

| Layer       | Choice                                                                                                                 | Notes                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Monorepo    | npm workspaces                                                                                                         | No extra tooling                                                                                          |
| Frontend    | React 19 + Vite, React Router, Tailwind, React Hook Form + Zod, TanStack Query                                         | SPA                                                                                                       |
| Backend     | Node + Express 5 (TypeScript; dev runs `node --watch --import tsx`)                                                    | Thin routes over services. Not `tsx watch`: on Windows it hangs when `concurrently` gives it a stdin pipe |
| DB          | **PostgreSQL 17 + PostGIS 3** (`postgis/postgis` Docker image locally; Neon, which supports PostGIS, for deploy)       | Geospatial matching is a core domain capability                                                           |
| ORM         | Prisma, with raw SQL (`$queryRaw`) only in the geo repository layer                                                    | See §4                                                                                                    |
| Geocoding   | **Geoapify** behind a vendor-neutral `Geocoder` interface; `MockGeocoder` for tests and seeds                          | See §3                                                                                                    |
| Testing     | Vitest (unit) + Supertest (API integration against a PostGIS test DB)                                                  |                                                                                                           |
| CI / deploy | GitHub Actions (lint, typecheck, test with a PostGIS service container); Vercel (web), Render/Railway (API), Neon (DB) |                                                                                                           |

---

## 2. Frontend pages & user flow

```
/                          Landing
/start                     [ I Have Capacity ]   [ I Need Capacity ]
  ├─ /have                 Truck leg | Warehouse space
  │    ├─ /list/truck            "Fill your empty or part-empty leg" (carrier form)
  │    └─ /list/warehouse        "List idle warehouse space"
  │         → /listings/:kind/:id     Confirmation + summary
  └─ /need                 Transportation | Storage
       ├─ /request/transport
       └─ /request/storage
            → /requests/:kind/:id/matches   Ranked matches
/how-matching-works        Plain-language explanation of filters, metrics, weights
```

**Carrier truck form.** This is the most important UX in the product. It is a short guided form written in carrier language, not shipper language:

1. **"Where will your truck be free?"** Origin, for example where the current delivery ends.
2. **"Where are you heading next?"** Destination, such as the home base or the next committed pickup. This field is required, because a leg with no destination is not stranded capacity.
3. **"When are you leaving?"** Departure window (earliest and latest), plus an optional **"Must arrive by"** if the next commitment is fixed.
4. **"Is the trailer empty or partly loaded?"** An empty/partial toggle. For partial, the carrier enters the pallets and weight already on board; live text shows the spare room (e.g. "Room for 12 more pallets and 22,000 lb"). There's no fill bar: capacity has two dimensions, so a single bar would imply a misleading combined utilisation. An EMPTY leg always submits zero committed capacity.
5. **Equipment & room:** trailer type, total pallet and weight capacity, pre-filled with editable starting values for a typical 53′ dry van (26 pallets, 45,000 lb). Changing the trailer type leaves them alone; there are no per-type defaults.
6. **"How far off your route will you go?"** Max detour in miles (slider, default 100; 5–300 in steps of 5 as a UI convenience, while the API accepts any whole number 1–300). The form notes that a larger allowance makes the leg eligible for more shipments without improving its rank.
7. **Price:** flat price or rate per loaded mile.

After submitting, the carrier lands on `/listings/truck/:id`, which shows the leg as persisted (fetched back from the API).

**Matches page:** a request summary, then ranked cards showing the overall score, a breakdown bar, key metrics (§5), plain-language reasons, the estimated price and a mailto contact link. Includes empty, loading and error states. All road distances carry an "est." label with a tooltip: _"Estimated from straight-line distance × 1.2. Not a routed road distance."_

**Landing page:** problem, solution, how it works, truck and warehouse cards, and how ranking works. **It contains no numerical claims unless backed by a real, linked citation** verified at implementation time, for example published research on empty-mile rates. If a claim can't be sourced, the copy stays qualitative. There are no invented stats, testimonials or "trusted by" logos.

---

## 3. Backend architecture

```
apps/api/src
 ├─ routes/            parse → Zod validate → service → respond
 ├─ services/          listings, requests, matches (orchestration)
 ├─ repositories/      Prisma CRUD + geo.repository.ts (raw PostGIS SQL: candidates + distances)
 ├─ matching/          PURE functions: no DB, HTTP, or vendor imports
 │   ├─ truck.ts       feasibility checks, metrics, scoring for truck legs
 │   ├─ warehouse.ts   feasibility checks, metrics, scoring for warehouse space
 │   ├─ metrics.ts     detour, additional miles, empty miles recovered, utilisation, est. time
 │   └─ config.ts      ALL weights, thresholds, road factor, avg speed (tunable defaults)
 ├─ geocoding/
 │   ├─ geocoder.ts    interface Geocoder { search(q): Place[]; } with Place = {label, lat, lng, provider, providerPlaceId?}
 │   ├─ geoapify.ts    GeoapifyGeocoder (only file that knows Geoapify)
 │   ├─ mock.ts        MockGeocoder (deterministic fixture places)
 │   ├─ cached.ts      CachedGeocoder decorator → GeocodeCache table
 │   └─ index.ts       factory chosen by env GEOCODER=geoapify|mock
 └─ middleware/        errors, logging, 404, rate limit on /geocode (protects API quota)
```

**Geocoding vendor independence.** Domain tables store only `label, lat, lng` (plus a PostGIS point), never vendor-specific payloads. Switching vendors means adding one class and changing an env var. Geoapify was chosen because its terms permit storing and caching results, which this design depends on. It requires OSM/Geoapify attribution, which goes in the footer and next to the location input. Re-check the current terms before launch.

**Matching pipeline** (computed on demand; no stored matches in V1):

1. **PostGIS candidate query** (`geo.repository.ts`): applies the cheap hard filters in SQL (status, trailer type or storage unit, capacity, date overlap, and a spatial pre-filter via `ST_DWithin` on GiST-indexed `geography` columns). It **returns the straight-line distances the scorer needs**, computed with `ST_Distance`.
2. **Pure matching functions** (`matching/`): take a request plus candidates with precomputed distances, then apply the exact feasibility checks, compute metrics, score, rank and generate reasons. PostGIS does the spatial work and TypeScript does the readable logic, so the algorithm can be read top to bottom in one file. It's unit-tested with plain objects and needs no database.

### API endpoints (`/api`)

| Method   | Path                                             | Purpose                                                          |
| -------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| GET      | `/health`                                        | Liveness + DB/PostGIS check                                      |
| GET      | `/geocode/search?q=`                             | Autocomplete proxy (key stays server-side; cached; rate-limited) |
| POST/GET | `/truck-legs`, `/truck-legs/:id`                 | Create or fetch stranded truck capacity                          |
| POST/GET | `/warehouse-spaces`, `/warehouse-spaces/:id`     | Create or fetch idle warehouse capacity                          |
| POST/GET | `/transport-requests`, `/transport-requests/:id` | Create or fetch a transport need                                 |
| GET      | `/transport-requests/:id/matches`                | Ranked truck-leg matches                                         |
| POST/GET | `/storage-requests`, `/storage-requests/:id`     | Create or fetch a storage need                                   |
| GET      | `/storage-requests/:id/matches`                  | Ranked warehouse matches                                         |

Error shape: `{ error: { code, message, details? } }`. Validation failures return 400 with field details.

---

## 4. Data models (PostgreSQL + PostGIS via Prisma)

Each record has `id` (cuid), `companyName`, `contactName`, `contactEmail`, `status` (ACTIVE | CLOSED), `createdAt` and `updatedAt`. Each location is stored as `*Label`, `*Lat`, `*Lng` plus a **generated PostGIS column**: `*Geog geography(Point,4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) STORED`, with a GiST index. Prisma declares these as `Unsupported("geography(Point,4326)")`, and they're added in a hand-edited migration that also runs `CREATE EXTENSION postgis`. App code writes lat/lng normally and the database maintains the geography.

**Generated-column migration rules.** Prisma has no generated-column support: it introspects the generation expression as a column default, so each `*Geog` field is declared `Unsupported("geography(Point,4326)")? @default(dbgenerated("…"))` with the expression exactly as Postgres formats it (Prisma compares the text literally). Unsupported fields are absent from the Prisma client, so app code can't write them. Any migration that adds a `*Geog` column or touches its lat/lng sources must be hand-edited: new columns as `GENERATED ALWAYS AS (…) STORED`, renames as `RENAME COLUMN` (never Prisma's drop + add), expression changes as `ALTER COLUMN … SET EXPRESSION AS (…)` (Postgres 17+). Copy the `dbgenerated` string from `prisma db pull --print`; never retype it. Prisma's generated SQL for these cases fails loudly rather than silently (Postgres rejects it). `npm run db:drift` (run in CI against a freshly migrated database) fails if the schema and the migrations disagree.

**Enums:** `TrailerType` (DRY_VAN, REEFER, FLATBED) · `LoadState` (EMPTY, PARTIAL) · `TruckPricingBasis` (FLAT, PER_LOADED_MILE) · `StoragePricingPeriod` (DAY, WEEK, MONTH) · `Status`. Pallet positions are the only V1 storage unit, so there is no unit enum (decided in Phase 4).

**TruckLeg** (stranded truck capacity: a movement the carrier is already planning)

- origin*, destination* (both required)
- departureEarliest, departureLatest, arriveBy? (fixed next commitment)
- loadState, trailerType
- totalPallets, totalWeightLbs, committedPallets (0 if EMPTY), committedWeightLbs (0 if EMPTY)
- maxDetourMiles (default 100, at most 300)
- pricingBasis, priceAmount (USD); notes
- Validation guards against load-board drift: destination is required and at least 10 straight-line miles from origin; the departure window is at most 72h and at most 30 days ahead; committed < total.
- These numbers are **V1 product-policy defaults** (`TRANSPORT_POLICY` in `packages/shared`), tunable and shared by form and API. They are not data-integrity rules and not derived from data. The minimum-distance check uses a haversine great-circle distance (within 0.5% of PostGIS, asserted in integration tests). It replaces exact coordinate equality, which differently geocoded points in the same place would slip past.

**TransportRequest**

- pickup*, dropoff* (at least 10 straight-line miles apart, same policy), pickupEarliest, pickupLatest, deliverBy?
- trailerType, pallets, weightLbs, maxBudget?; notes

**WarehouseSpace** (genuinely idle capacity: a bounded block of pallet positions free for a known window)

- location*
- quantityAvailable (pallet positions), minPallets? (smallest block the operator will rent)
- availableFrom, availableTo (calendar dates), minStorageDays (default 1)
- pricingPeriod (DAY/WEEK/MONTH), pricePerPalletPerPeriod, handlingFeePerPallet? (one combined in-and-out fee per pallet)
- temperatureControlled, foodGrade (self-declared by the operator, not verified); notes

**StorageRequest**

- location*, maxDistanceMiles (default 25, at most 250; est. road miles; a hard limit only, never a ranking input)
- pallets, startDate, endDate (calendar dates)
- needsTemperatureControl, needsFoodGrade, maxBudgetTotal?; notes

**Storage dates (decided in Phase 4).** Dates are calendar days (`DATE` columns, `YYYY-MM-DD` on the wire, UTC midnights in code), so day arithmetic is exact. `endDate` is the move-out day and stay length = `endDate − startDate` days (at least 1). `availableTo` is the last day goods may be on site, so the longest stay a listing can hold is `availableTo − availableFrom` days. "Today" is the UTC day, with one day of tolerance for users west of UTC.

**Storage policy.** `STORAGE_POLICY` in `packages/shared` holds V1 product-policy defaults (tunable; not universal warehouse-domain truths), shared by form and API: an availability window of at most 180 days and a stay of at most 180 days, both starting within 90 days (a marketplace policy for near-term stranded capacity); `minStorageDays` no longer than the window; `minPallets ≤ quantityAvailable`. The bounded window is the warehouse counterpart of the truck guards: a listing is a specific block of idle space, not a permanent facility entry. Floor sqft, hazmat and temperature ranges are deferred.

**GeocodeCache:** one row per result: provider, normalizedQuery, rank, label, lat, lng, createdAt; unique `(provider, normalizedQuery, rank)` so autocomplete lists are served whole and switching geocoders never serves another provider's results. Empty results aren't cached; no expiry in V1.

Money columns (`priceAmount`, `maxBudget`, …) are `Decimal(10,2)`; repositories convert to `number` at the API boundary. Timestamps are `timestamptz`. Integration tests run against a separate `*_test` database.

Plain B-tree indexes on `(status, trailerType, departureEarliest)` and `(status, availableFrom)`; GiST indexes on all geography columns. Later, a nullable `ownerId` foreign key can be added when auth arrives.

---

## 5. V1 matching algorithm

The principles are **feasibility first**, through hard constraints, then **ranking among feasible matches only**, with **route efficiency as the dominant truck signal**. All weights and thresholds live in `matching/config.ts`. They're **documented as tunable heuristic defaults, not as scientifically optimal values**, both in the README and on `/how-matching-works`.

**Distance convention:** PostGIS returns straight-line (geodesic) miles. Road-mile estimates are `straightLine × ROAD_FACTOR` (default 1.2). Every road-mile figure in API responses uses an `est` prefix in field names (e.g. `estAdditionalMiles`), and the UI labels it "est.".

### Truck leg ↔ Transport request

Notation: O = leg origin, X = leg destination, P = pickup, D = dropoff, d() = straight-line distance.

**Hard constraints** (SQL pre-filter where possible, re-checked in TS):

1. Status ACTIVE; trailer types equal
2. Spare capacity is sufficient: `totalPallets − committedPallets ≥ pallets` and the same for weight
3. Time windows overlap, **arrival-adjusted** (decided in Phase 2): shift the departure window by the est. drive time O→P (`d(O,P) × ROAD_FACTOR / AVG_SPEED_MPH`), then require `departureEarliest + drive ≤ pickupLatest` and `departureLatest + drive ≥ pickupEarliest`. This asks whether the truck can be at the pickup during the window; it equals the plain overlap when O ≈ P.
4. Detour is within the carrier's limit: `detour = d(O,P) + d(P,D) + d(D,X) − d(O,X)`, with `detour × ROAD_FACTOR ≤ maxDetourMiles`
5. Timing is feasible (only checked when `arriveBy` or `deliverBy` is set; TS only): leave at `departureEarliest`, drive to P, wait for `pickupEarliest` if early, then `HANDLING_HOURS` (default 2) at each stop and `AVG_SPEED_MPH` (default 50) driving. Arrival at D must be ≤ `deliverBy`; arrival at X must be ≤ `arriveBy`.
6. Spatial strategy (decided in Phase 2): the exact detour (rule 4) is computed in SQL with `ST_Distance` on the stored geography columns, after the B-tree-friendly filters. A radius pre-filter like `ST_DWithin(origin, pickup, maxDetour + buffer)` is **not valid**: a leg can pass straight through the pickup from far away (seeded Oklahoma City → Houston is ~190 mi from Dallas with a ~2 est. mi detour). So the detour step isn't GiST-assisted. That's fine at V1 volume; add a corridor index if listing volume requires it.

**Metrics** (computed for every feasible match and shown on the card):

| Metric                     | Definition                                                                                                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Est. additional miles      | `detour × ROAD_FACTOR`, the extra miles the carrier drives                                                                                                                                                           |
| Est. loaded miles          | `d(P,D) × ROAD_FACTOR`                                                                                                                                                                                               |
| Est. empty miles recovered | **EMPTY legs only:** `min(d(P,D), d(O,X)) × ROAD_FACTOR`, the planned empty miles that now carry freight. For PARTIAL legs it is omitted, because the truck wasn't empty, and spare capacity filled is shown instead |
| Capacity utilisation       | before = committed / total; after = (committed + request) / total. Shown for pallets and weight; the higher ratio, which is the limiting one, is highlighted                                                         |
| Est. price                 | FLAT → priceAmount; PER_LOADED_MILE → priceAmount × est. loaded miles                                                                                                                                                |

**Score** (0–100 = 100 × Σ weight × component). Default weights:

| Component                          | Default weight | Formula (0–1)                                                                                                                                                                                      |
| ---------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Route efficiency**               | **0.55**       | `clamp(1 − estAdditionalMiles / ROUTE_EFFICIENCY_REFERENCE_MILES)` (100). A fixed reference, not the carrier's `maxDetourMiles`, so a larger allowance widens feasibility but never raises ranking |
| Spare-capacity fit (`capacityFit`) | 0.15           | Share of the carrier's **spare** room (total − committed) the request takes, in the dimension it takes more of. Freight already on board doesn't count                                             |
| Price                              | 0.15           | `clamp(1.5 − estPrice / reference)`: 0.5 at the reference, 1 at half of it. Reference = the budget if set, else the median est. price of all feasible matches (before the cap)                     |
| Timing                             | 0.15           | `clamp(slack / 4 h)`, where slack is the est. hours the earliest schedule can slip before the pickup window closes, the deliver-by or the carrier's arrive-by (whichever is tightest)              |

Ties are broken by fewer additional miles, then lower est. price, then leg id. Results are capped at 20.

**Presentation (Phase 3).** Each match also returns `spareCapacityUsed`, `estScheduleSlackHours` and `scheduleLimitedBy`, the price reference it was scored against, and at most two **highlights**: deterministic, rule-derived notes with stable codes (`ON_ROUTE`, `NEAR_ROUTE`, `LARGE_DETOUR`, `UNDER_BUDGET`, `OVER_BUDGET`, `BELOW_TYPICAL_PRICE`, `USES_MOST_SPARE_CAPACITY`, `COMFORTABLE_SCHEDULE`, `TIGHT_SCHEDULE`). Cautions come first. Thresholds are `HIGHLIGHT_THRESHOLDS` in `config.ts`; highlights never affect score or rank. The UI marks every estimated value "est." and explains it once per page.

### Warehouse space ↔ Storage request

**Hard constraints:** status ACTIVE; units equal; `quantityAvailable ≥ quantity ≥ (minQuantity ?? 0)`; window coverage (`availableFrom ≤ startDate` and `availableTo ≥ endDate`); `duration ≥ minStorageDays`; required features are a subset of the listing's features; `ST_DWithin(location, requestLocation, maxDistanceMiles)`.

**Metrics:** est. distance (est. road miles); est. total cost = `pricePerUnitPerPeriod × quantity × periods(duration, pricingPeriod)` plus handling fees on the way in and out; idle space filled = `quantity / quantityAvailable`.

**Score defaults:** Location 0.35 (`1 − distance / maxDistanceMiles`) · Price 0.35 (vs. maxBudgetTotal, same formula as trucks) · Utilisation 0.15 · Date fit 0.15 (decays with idle lead time between availableFrom and startDate).

**Match output:** `{ listing, score, breakdown, metrics, reasons[] }`. Reasons are generated from the metrics, for example "Adds ~38 est. mi to the carrier's planned trip", "Puts ~210 est. empty miles to use", or "Trailer goes from 40% → 85% full".

---

## 6. Security & privacy posture (V1, stated honestly)

- **There is no authentication.** Request and listing URLs use cuids, which are hard to guess. That is a **demo convenience, not access control**: anyone with a link can view the record. The README and UI do not describe this as security.
- Contact details are shown on match cards, so this is a public demo. Seed data uses `example.com` addresses.
- Basic measures only: input validation, rate limiting on the geocode proxy, CORS restricted to the web origin, and secrets kept in env vars.

---

## 7. Folder structure

```
deadspace/
├─ apps/
│  ├─ web/src/  pages/ · components/{ui,landing,forms,matches}/ (LocationInput, TrailerFillBar, MatchCard, ScoreBreakdown, MetricPill) · api/ · lib/
│  └─ api/
│     ├─ src/  routes/ · services/ · repositories/ · matching/ · geocoding/ · middleware/ · app.ts · server.ts
│     ├─ prisma/  schema.prisma · migrations/ (incl. PostGIS extension + generated geog columns) · seed.ts
│     └─ test/  unit/matching/* · integration/*
├─ packages/shared/   Zod schemas, enums, request/response DTOs (incl. match + metrics types)
├─ docker-compose.yml          postgis/postgis:17-3.5
├─ .github/workflows/ci.yml
├─ .env.example                DATABASE_URL, GEOCODER, GEOAPIFY_API_KEY, WEB_ORIGIN, VITE_API_URL
└─ package.json · tsconfig.base.json · eslint/prettier · README.md
```

---

## 8. Out of scope for V1

- Container shipping, intermodal, multi-stop or multi-leg routing, consolidating multiple requests onto one leg
- **Generic load-board features:** shipper-posted loads that carriers browse, open-ended "truck available anywhere" posts
- Auth, accounts, organisations, dashboards
- Booking, contracts, payments, invoicing, insurance, carrier verification (MC/DOT)
- Messaging, email or SMS notifications (a mailto link is used instead)
- Routed road distances or routing APIs, live tracking, interactive maps
- ML or dynamic pricing, emissions calculators (unless a cited methodology is added later), stored matches, background jobs, Redis
- Reverse matching (listing → requests), admin panel, ratings
- Microservices, Kubernetes, GraphQL, SSR

---

## 9. Phased plan (vertical slice first)

Each phase ends working, verified and committed.

**Phase 0, scaffold.** npm workspaces, TS/ESLint/Prettier, Vite app, Express app with `/api/health` (checks PostGIS), Docker Compose PostGIS, `.env.example`, and a CI workflow (lint, typecheck, test) running against a PostGIS service container. Root scripts: `dev`, `lint`, `typecheck`, `test` (unit, fast), `test:integration`, `build`, `db:migrate`, `db:seed`. These are required by the Claude Code hooks.

**Phase 1, transport data basics.** Shared Zod schemas and enums for the transport side; Prisma schema plus migration for `TruckLeg`, `TransportRequest` and `GeocodeCache` (extension, generated geography columns, GiST indexes); the `Geocoder` interface with `GeoapifyGeocoder`, `MockGeocoder` and `CachedGeocoder`; seed data of about 30 realistic truck legs (empty and partial) with fixed coordinates.

**Phase 2, transport vertical slice (end to end).**

- `geo.repository.ts` candidate query, with straight-line distances computed in PostGIS
- `matching/truck.ts` **v0**: all hard constraints (including the deadline check) plus a route-efficiency-only score, with unit tests. Built ahead of Phase 3: the §5 metrics (additional, loaded, empty-recovered miles, utilisation, est. price), reasons, and EMPTY/PARTIAL handling. Ties go to fewer additional miles, then lower est. price, then leg id.
- Endpoints for truck legs, transport requests and matches, plus `/geocode/search`, and integration tests (create request → get matches, seeded Dallas → Houston scenario)
- Minimal, functional UI: transport request form with LocationInput, and a matches page with score, est. metrics and reasons. The carrier truck-leg form moved to Phase 3 (endpoints exist).
- Exit criterion: a user can submit a transport request in the browser and see ranked, real matches from the database.

**Phase 3, refine truck matching.** The full weighted score from `config.ts` (capacity, price and timing components), a ScoreBreakdown UI, the "est." tooltip copy, and expanded unit tests. Metrics, reasons, timing feasibility and EMPTY/PARTIAL behaviour were already built in Phase 2. Also build and polish the guided carrier form (trailer defaults, live spare-room text, detour slider) and its confirmation page (built in Phase 3, see §2).

- **Route-efficiency normalisation (decided in the Phase 1 review; built in Phase 3 with a fixed `ROUTE_EFFICIENCY_REFERENCE_MILES` reference, see §5).** Original rationale: The §5 formula `1 − estAdditionalMiles / maxDetourMiles` divides by the carrier's _own_ declared limit, so a higher limit inflates that leg's score (at 300, a 150-mile detour scores 0.5; at 100 the same leg is infeasible). In Phase 3, normalise against `min(maxDetourMiles, ROUTE_EFFICIENCY_REFERENCE_MILES)` from `matching/config.ts`, so a carrier's limit only widens feasibility and never boosts ranking. Add unit tests showing two legs with identical geometry but different `maxDetourMiles` get the same route-efficiency component (below the reference). Update this section's score table and `/how-matching-works` to match.

**Phase 4, warehouse flow.** Schemas, migration and seed for `WarehouseSpace` and `StorageRequest`; `matching/warehouse.ts` plus tests; endpoints; warehouse listing form and storage request form; storage matches page reusing the match components.

**Phase 5, landing & product polish.** Landing page with only qualitative claims or verified, cited statistics; the `/start` → `/have` | `/need` flow; `/how-matching-works`; confirmation pages; responsive layout, accessibility and empty, loading and error states; geocoder attribution.

**Phase 6, ship.** README (pitch, architecture diagram, matching write-up with the tunable-weights disclaimer, honest security note, setup), deployment to Vercel, Render and Neon with PostGIS, final CI, and a demo script with screenshots.

---

## Verification targets

- **Unit (Vitest):** an on-route leg outranks a 90-mile detour; a trailer mismatch, insufficient spare capacity, a missed `arriveBy` or an over-limit detour is excluded; empty miles recovered appears only for EMPTY legs; utilisation before and after is correct; warehouse `minStorageDays` and `minQuantity` are enforced; weights are read from config.
- **Integration (Supertest + PostGIS test DB + MockGeocoder):** create a leg and a request, then confirm `/matches` returns the expected ordering and metrics.
- **Manual:** `docker compose up -d && npm run db:migrate && npm run db:seed && npm run dev`. Request a Dallas → Houston shipment and confirm the seeded legs with near-zero detour rank first, with sensible "est." metrics and reasons.
- `npm run lint`, `npm run typecheck`, `npm run build` and CI all pass.
