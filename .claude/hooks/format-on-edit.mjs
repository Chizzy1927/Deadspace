// PostToolUse hook: formats the single file Claude just edited.
// Prettier for formattable files, then `eslint --fix` for TypeScript.
// Never blocks (always exits 0); remaining lint errors are caught by the Stop hook.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const SKIP = /(^|\/)(node_modules|dist|build|coverage|\.git)\/|prisma\/migrations\/|(^|\/)package-lock\.json$/;
const PRETTIER = /\.(ts|tsx|js|jsx|mjs|cjs|json|css|md|ya?ml|html)$/;
const ESLINT = /\.(ts|tsx)$/;

function run(args) {
  // shell: true so `npx` resolves to npx.cmd on Windows.
  spawnSync('npx', ['--no-install', ...args], { cwd: root, stdio: 'ignore', shell: true });
}

function main() {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const filePath = input?.tool_input?.file_path;
  if (!filePath) return;

  const rel = path.relative(root, path.resolve(root, filePath));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return; // outside the repo
  const posixRel = rel.split(path.sep).join('/');
  if (SKIP.test(posixRel) || !existsSync(path.join(root, rel))) return;

  // Before Phase 0 installs tooling, do nothing.
  if (PRETTIER.test(posixRel) && existsSync(path.join(root, 'node_modules', 'prettier'))) {
    run(['prettier', '--write', '--log-level', 'silent', `"${posixRel}"`]);
  }
  if (ESLINT.test(posixRel) && existsSync(path.join(root, 'node_modules', 'eslint'))) {
    run(['eslint', '--fix', `"${posixRel}"`]);
  }
}

try {
  main();
} catch {
  // Formatting is best-effort; never interrupt Claude.
}
process.exit(0);
