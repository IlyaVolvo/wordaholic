/**
 * Local loop: keep dist/ in sync with static sources and serve it.
 * PolyWordlot still needs `npm run build` (or `npm run build:polywordlot`) after UI changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildLanguagesCatalog } from './build-languages-catalog.js';
import { embedAdminPassword } from './embed-admin-password.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyDir(src, dest, { skipNames = ['.DS_Store'] } = {}) {
  if (!fs.existsSync(src)) return;
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skipNames.includes(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to, { skipNames });
    else fs.copyFileSync(from, to);
  }
}

function stampServiceWorker() {
  const src = path.join(ROOT, 'app/updates/service-worker.js');
  const dest = path.join(DIST, 'sw.js');
  let sw = fs.readFileSync(src, 'utf8');
  sw = sw.replace(
    /const CACHE_SHELL = ['"][^'"]+['"]/,
    `const CACHE_SHELL = 'wordaholic-shell-dev-${Date.now()}'`
  );
  fs.writeFileSync(dest, sw);
}

function syncStatic(reason) {
  copyDir(path.join(ROOT, 'public'), DIST);
  copyDir(path.join(ROOT, 'app'), path.join(DIST, 'app'));
  copyDir(path.join(ROOT, 'word-data'), path.join(DIST, 'word-data'), {
    skipNames: ['.DS_Store', 'master.json'],
  });
  copyDir(path.join(ROOT, 'games/transword'), path.join(DIST, 'games/transword'));
  embedAdminPassword(path.join(DIST, 'games/transword/admin'));
  ensureDir(path.join(DIST, 'data'));
  fs.writeFileSync(
    path.join(DIST, 'data/languages.json'),
    JSON.stringify(buildLanguagesCatalog(), null, 2)
  );
  stampServiceWorker();
  console.log(`Synced static → dist/ (${reason})`);
}

function watchTree(rel, onChange) {
  const dir = path.join(ROOT, rel);
  if (!fs.existsSync(dir)) return;
  fs.watch(dir, { recursive: true }, (_event, filename) => {
    if (!filename || filename.split(path.sep).includes('.DS_Store')) return;
    onChange(path.join(rel, filename));
  });
}

function main() {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.log('No dist/ yet — running full build once…');
    execSync('node scripts/build.js', { cwd: ROOT, stdio: 'inherit' });
  } else {
    syncStatic('startup');
  }

  let timer = null;
  const schedule = (file) => {
    clearTimeout(timer);
    timer = setTimeout(() => syncStatic(file), 200);
  };

  watchTree('public', schedule);
  watchTree('app', schedule);
  watchTree('word-data', schedule);
  watchTree('games/transword', schedule);

  console.log('Watching public/, app/, word-data/, games/transword/');
  console.log('PolyWordlot UI: npm run build:polywordlot (then reload)');

  const child = spawn(process.execPath, ['scripts/serve.js'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

main();
