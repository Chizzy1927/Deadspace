---
name: verify
description: Verify DeadSpace changes after meaningful implementation work - inspect the diff, run the lint/typecheck/test/build checks relevant to the affected workspaces, check that tests were not weakened, and report results honestly. Use before declaring a task or phase complete.
---

# Verify DeadSpace changes

Report what actually happened. Never present a failing or skipped check as passing.
Keep output in context lean: capture the relevant error excerpt, not entire logs.

## 1. Scope the change

- `git status --porcelain` and `git diff --stat HEAD` (include untracked files).
- Classify affected areas: `packages/shared` (affects web + api), `apps/api`, `apps/web`,
  `apps/api/prisma` (schema/migrations), `apps/api/src/matching`, `.github/`.

## 2. Test-integrity review (read the diff, don't just grep)

Inspect `git diff HEAD -- '**/*.test.ts' '**/*.test.tsx' '**/vitest.config.*' 'apps/api/src/matching/config.ts'` and flag:

- removed or emptied tests, removed `expect(...)` lines, loosened matchers
  (e.g. `toBe` → `toBeDefined`, widened tolerances), changed expected values
- added `.skip`, `.only`, `.todo`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `as any`
- matching weights/thresholds changed in the same diff as the tests that depend on them

For each flag, state whether it's justified (with the reason) or a weakening that must be reverted.

## 3. Run checks (from repo root)

| When                          | Run                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Always                        | `npm run lint`, `npm run typecheck`, `npm test`                                                                           |
| api / shared / prisma changed | `npm run test:integration` (needs `docker compose up -d`; if the DB is unavailable, mark NOT RUN, never PASS)             |
| prisma changed                | `npm exec -w apps/api -- prisma validate`, and confirm a migration accompanies schema changes                             |
| any app code changed          | `npm run build`                                                                                                           |
| user-facing flow changed      | Exercise it in the running app (`npm run dev`, or the `run` skill), or state explicitly that it was not verified in a browser |

Run every required check even if an earlier one fails, so the report is complete.

## 4. Report

- Table: check · command · PASS / FAIL / NOT RUN (reason).
- For each FAIL: the relevant error excerpt and the likely cause.
- Test-integrity findings.
- Verdict: **Verified** only if every required check passed and no unjustified weakening was
  found; otherwise **Not verified**, listing what remains.

Do not fix things silently during verification. Report first; fix as a follow-up, then re-run.
