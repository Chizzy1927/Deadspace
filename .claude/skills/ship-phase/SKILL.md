---
name: ship-phase
description: Ship an already-implemented, locally complete phase - verify, commit, push the feature branch, open a PR into main, wait for CI (fixing failures on the branch), merge on approval, and fast-forward local main. User-invoked only.
disable-model-invocation: true
argument-hint: '[commit message]'
---

# Ship a completed phase

Takes finished work on a feature branch to merged-and-synced `main`. Implementation is done before
this starts; this skill only verifies and ships it. Report every outcome faithfully.

## Never

- Force push (`--force`, `--force-with-lease`, `+refspec`), push to `main`, or commit on `main`.
- Merge with required CI failing, pending or missing on the PR's current head, or with `--admin`/`--auto`.
- Edit tests, assertions or `matching/config.ts` thresholds to make anything pass.
- Change implementation while verifying. Failures are reported first; fixes are separate, approved work.
- Delete branches (local or remote), create the next phase branch, or start the next phase.
- Assume a GitHub action worked. Confirm it with `git`/`gh`, or ask the user to confirm.
- Treat an earlier approval as covering a later action, or proceed on Claude's own judgement at a gate.

## Gates

Ask, show what is being approved, and wait for an explicit yes. If anything changes after the
approval (new commit, new CI run), ask again.

- **G1 Commit**: staged files, commit message, `/verify` table (and any waivers).
- **G2 Push + open PR**: branch, commits ahead of `origin/main`, PR title/body, base `main`.
- **GF CI fix**: failing step, root cause, diff, local results. One approval covers that commit + push.
- **G3 Merge**: always asked fresh; shows the PR, head SHA, CI status on that SHA, and merge method (merge commit).

## GitHub access

Use `gh` only if `gh auth status` succeeds; it is never required. Without it, give the exact UI
action (link + button) and wait for the user to confirm the result, e.g. the PR number or "merged".
Compare URL: `https://github.com/<owner>/<repo>/compare/main...<branch>?expand=1` (from `git remote get-url origin`).
Required CI = the `check` job in `.github/workflows/ci.yml` on the PR's head SHA.

## 0. Preflight and resume (read-only)

`git fetch origin`, `git status -sb`, `git branch -vv`, `git rev-list --left-right --count origin/main...HEAD`.

- On `main` or detached HEAD → **abort**.
- Branch behind `origin/main` → **stop**, then offer (each needs explicit approval):
  never pushed → rebase onto `origin/main`; already pushed → `git merge origin/main` into the branch.
  Afterwards re-run `/verify origin/main` and continue (pushing normally). Never force push.
- Resume at the first unfinished step: uncommitted changes → 1; unpushed commits → 4;
  pushed, no PR → 4 (PR part); PR open → 5; PR merged → 7.

## 1. Review the diff

`git diff --stat $(git merge-base origin/main HEAD)`, plus untracked files. Summarise the change and
flag unexpected files, scope drift, and ignored or generated paths.

## 2. Verify

Run `/verify origin/main`. Keep its PASS / FAIL / NOT RUN table as-is.
Any FAIL or test-integrity finding → **stop**. A required check that was NOT RUN → **stop**, unless
the user waives it explicitly with a reason. Record the reason for the report and PR body.

## 3. Commit (G1)

Stage reviewed paths explicitly, then check `git diff --cached --name-status`. **Stop** if anything
staged matches `.env*` (except `.env.example`), keys or credentials, `dist/`, `build/`, `coverage/`,
`node_modules/`, `apps/api/src/generated/`, `*.log`, or any git-ignored path.
Use the user's message (argument) or propose one. Follow the commit attribution rules in force.
After G1, commit. Then `git show --stat HEAD` must match the reviewed diff, and `git status --short` must be empty.

## 4. Push and open PR (G2)

After G2: `git push -u origin <branch>`. A rejection → **stop** (no force). Confirm with `git branch -vv`.
PR base `main`. Body: summary, verification table, waivers + reasons, deferred items.
Open it with `gh pr create --base main` or the compare URL. Confirm the PR number and base.

## 5. CI

Watch the required check on the PR head SHA (`gh pr checks <n> --watch`), or ask the user to report it.
It must be green on the SHA equal to local `HEAD`; green on an older SHA doesn't count.

**On failure**, don't merge, and don't guess:

1. Read the failing step and error (`gh run view <id> --log-failed`, or ask the user to paste it).
2. Find the root cause. Reproduce it locally; for clean-checkout-only failures, use a fresh clone in a temp dir.
3. Fix it on the same branch. Run the relevant `/verify origin/main` checks.
4. Show the diagnosis + diff → **GF** → a separate commit, a normal push. Back to 5.

## 6. Merge (G3)

Preconditions: PR open, base `main`, mergeable, required check green on head SHA == local `HEAD`,
nothing unpushed. After G3: `gh pr merge <n> --merge`, or the user merges in the UI with
"Create a merge commit". Confirm state MERGED and `git merge-base --is-ancestor HEAD origin/main` after fetching.

## 7. Sync main

`git fetch origin`, `git switch main`, `git merge --ff-only origin/main`. If that fails → **stop**
(local `main` diverged). Confirm `main` == `origin/main` and a clean tree.

## 8. Report and stop

Commit hashes, PR number/URL, CI result per head SHA, merge commit, `git log --oneline -5`,
`git branch -vv`, `git status --short`, waivers, and anything not run. Leave branches in place.
Recommend `/clear` only now (merged, `main` synced, tree clean).
