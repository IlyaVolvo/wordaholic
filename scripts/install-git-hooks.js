/**
 * Copy scripts/git-hooks into .git/hooks so commits check word lists.
 * Does not change git config. Skips a checkout that is not a git repo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'scripts', 'git-hooks');
const HOOKS = path.join(ROOT, '.git', 'hooks');

if (!fs.existsSync(path.join(ROOT, '.git'))) {
  console.log('No .git directory; word-list hook not installed.');
} else {
  fs.mkdirSync(HOOKS, { recursive: true });
  for (const name of fs.readdirSync(SOURCE)) {
    const from = path.join(SOURCE, name);
    if (!fs.statSync(from).isFile()) continue;
    const to = path.join(HOOKS, name);
    fs.copyFileSync(from, to);
    fs.chmodSync(to, 0o755);
    console.log(`Installed ${path.relative(ROOT, to)}`);
  }
}
