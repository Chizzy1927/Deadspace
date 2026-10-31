# Follow-ups

Non-blocking follow-ups, not Phase 3 requirements.

- **LocationInput blur timing.** The 150 ms close-on-blur timer in `apps/web/src/components/LocationInput.tsx`
  is not cancelled if focus quickly returns, so the suggestion list can close after the user has returned to
  the field.
- **Storage integration tests near UTC midnight.** `apps/api/test/integration/storage-api.test.ts`,
  `warehouse-candidates.test.ts` and the shared `daysFromToday` helper derive dates from the UTC day at
  call time. A run that straddles 00:00 UTC could see dates shift between building the payload and the
  request, or hit the "start date in the past" tolerance. Consider injecting a fixed clock for these tests.
