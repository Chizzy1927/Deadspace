# Follow-ups

Non-blocking follow-ups, not Phase 3 requirements.

- **Shipper request validation focus order.** On a failed submit, standard inputs may receive focus
  before the visually earlier location fields, because the location Controllers are registered later
  (`apps/web/src/pages/TransportRequestPage.tsx`). The carrier form already handles this correctly:
  `shouldFocusError: false` plus focusing the first error in on-screen order in `TruckLegListingPage.tsx`.
  Consider applying the same approach to the shipper form.
- **LocationInput blur timing.** The 150 ms close-on-blur timer in `apps/web/src/components/LocationInput.tsx`
  is not cancelled if focus quickly returns, so the suggestion list can close after the user has returned to
  the field.
