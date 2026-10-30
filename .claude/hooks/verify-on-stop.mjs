// Stop hook: blocks Claude from finishing while typecheck, lint, or unit tests fail
// on changed code under apps/ or packages/.
// - No code changes, or an unchanged diff that already passed -> no checks run.
// - After MAX_BLOCKS consecutive failures on the same diff, Claude may stop, but the
//   user sees a warning that the work is NOT complete.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const CODE_PATHS = ['apps', 'packages'];
const CHECKS = ['typecheck', 'lint', 'test'];
const MAX_BLOCKS = 3;
const TAIL_LINES = 60;
const MAX_BUFFER = 64 * 1024 * 1024;
const stateFile = path.join(root, '.claude', '.cache', 'verify-state.json');

function git(args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: MAX_BUFFER });
  return r.status === 0 ? r.stdout : '';
}

function readState() {
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(state) {
  mkdirSync(path.dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function hasRequiredScripts() {
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    return CHECKS.every((check) => pkg.scripts?.[check]);
  } catch {
    return false; // no package.json yet (pre-Phase 0)
  }
}

// Fingerprint of all staged, unstaged, and untracked changes to code paths; null if none.
function changeFingerprint() {
  const status = git(['status', '--porcelain', '--untracked-files=all', '--', ...CODE_PATHS]);
  if (!status.trim()) return null;

  const hasHead = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: root }).status === 0;
  const hash = createHash('sha256').update(status);
  if (hasHead) {
    hash.update(git(['diff', 'HEAD', '--', ...CODE_PATHS]));
  } else {
    hash.update(git(['diff', '--', ...CODE_PATHS])).update(git(['diff', '--cached', '--', ...CODE_PATHS]));
  }
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z', '--', ...CODE_PATHS]);
  for (const file of untracked.split('\0').filter(Boolean)) {
    hash.update(file);
    try {
      hash.update(readFileSync(path.join(root, file)));
    } catch {
      // file vanished between listing and reading; status already covers it
    }
  }
  return hash.digest('hex');
}

function tail(text) {
  return text.trimEnd().split(/\r?\n/).slice(-TAIL_LINES).join('\n');
}

function main() {
  if (!hasRequiredScripts()) return 0;

  const fingerprint = changeFingerprint();
  const state = readState();
  if (!fingerprint) {
    if (state.blocks) writeState({ ...state, blocks: 0, gaveUpHash: null });
    return 0;
  }
  if (fingerprint === state.lastPassingHash) return 0;

  for (const check of CHECKS) {
    const r = spawnSync(`npm run ${check}`, { cwd: root, encoding: 'utf8', shell: true, maxBuffer: MAX_BUFFER });
    if (r.status === 0) continue;

    const output = tail(`${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? `\n${r.error.message}` : ''}`);

    // Already gave up on this exact diff: warn the user, don't loop again.
    if (fingerprint === state.gaveUpHash) {
      process.stdout.write(
        JSON.stringify({ systemMessage: `Stop gate: \`npm run ${check}\` is still failing. Treat the work as NOT complete.` }),
      );
      return 0;
    }

    const blocks = (state.blocks || 0) + 1;
    if (blocks > MAX_BLOCKS) {
      writeState({ ...state, blocks: 0, gaveUpHash: fingerprint });
      process.stdout.write(
        JSON.stringify({
          systemMessage: `Stop gate: \`npm run ${check}\` still failing after ${MAX_BLOCKS} attempts. Claude was allowed to stop. Treat the work as NOT complete.`,
        }),
      );
      return 0;
    }

    writeState({ ...state, blocks });
    process.stderr.write(
      `Stop gate (attempt ${blocks}/${MAX_BLOCKS}): \`npm run ${check}\` failed.\n\n${output}\n\n` +
        'Fix the root cause. Do not weaken, skip, or delete tests. ' +
        'If it cannot be fixed, stop and report the failure plainly.\n',
    );
    return 2; // blocks Claude from stopping; stderr is fed back to Claude
  }

  writeState({ lastPassingHash: fingerprint, blocks: 0, gaveUpHash: null });
  return 0;
}

process.exit(main());
