# Follow-ups

Non-blocking follow-ups, not Phase 3 requirements.

- **LocationInput blur timing.** The 150 ms close-on-blur timer in `apps/web/src/components/LocationInput.tsx`
  is not cancelled if focus quickly returns, so the suggestion list can close after the user has returned to
  the field.
- **Storage integration tests near UTC midnight.** `apps/api/test/integration/storage-api.test.ts`,
  `warehouse-candidates.test.ts` and the shared `daysFromToday` helper derive dates from the UTC day at
  call time. A run that straddles 00:00 UTC could see dates shift between building the payload and the
  request, or hit the "start date in the past" tolerance. Consider injecting a fixed clock for these tests.

## Deferred from Phase 5

Deliberately left out of the landing/demo phase; not forgotten.

- **Supply-form example prefill.** Only the two request forms have "Fill with an example". The truck and
  warehouse listing forms have sensible defaults and are demoed by typing.
- **Separate `/how-matching-works` page.** The explanation is a landing section (`#example-match`). A
  standalone page could go deeper (hard constraints per flow, full score formulas).
- **Storage example card on the landing page.** The storage example is a link on the "I need capacity"
  card; only a transport match is shown as the worked example.
- **Deployment.** Still Phase 6 (see `docs/ARCHITECTURE.md` §9).
- **Seed anchor visibility.** The seed's anchor date is only visible via `SEED_ANCHOR` / the seed output. If
  more than about a day passes between seeding and a demo, matches can disappear until re-seeding.
- **Reproducible README screenshots.** `docs/screenshots/` was captured by hand with headless Chrome against
  a freshly seeded database; there is no script to regenerate them when the UI changes.
- **Dark mode, animation, i18n.**
