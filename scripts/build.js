/**
 * Build static site: sync is separate; copy assets; catalog from native game dicts.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { buildLanguagesCatalog } from './build-languages-catalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

function gitCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dest) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function hashFile(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

function hashTree(dir, prefix = '') {
  /** @type {Record<string, string>} */
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const full = path.join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(out, hashTree(full, rel));
    else out[rel] = hashFile(full);
  }
  return out;
}

function main() {
  const pwDict = path.join(ROOT, 'games/polywordlot/dict');
  const twLangs = path.join(ROOT, 'games/transword/data/languages');
  if (!fs.existsSync(pwDict) || !fs.existsSync(twLangs)) {
    console.log('Game dictionaries missing — running sync-dicts…');
    execSync('node scripts/sync-dicts.js', { cwd: ROOT, stdio: 'inherit' });
  }

  rmrf(DIST);
  ensureDir(DIST);

  copyDir(path.join(ROOT, 'public'), DIST);
  copyDir(path.join(ROOT, 'app'), path.join(DIST, 'app'));
  fs.copyFileSync(path.join(ROOT, 'app/updates/service-worker.js'), path.join(DIST, 'sw.js'));

  // TransWord stays static; PolyWordlot is a Vite+React build of the mlw UI.
  copyDir(path.join(ROOT, 'games/transword'), path.join(DIST, 'games/transword'));
  console.log('Building PolyWordlot (mlw React port)…');
  execSync('npx vite build --config games/polywordlot/vite.config.ts', {
    cwd: ROOT,
    stdio: 'inherit',
  });
  copyDir(path.join(ROOT, 'games/polywordlot/dict'), path.join(DIST, 'games/polywordlot/dict'));

  const catalog = buildLanguagesCatalog();
  ensureDir(path.join(DIST, 'data'));
  fs.writeFileSync(path.join(DIST, 'data/languages.json'), JSON.stringify(catalog, null, 2));

  const gameHashes = {
    polywordlot: hashTree(path.join(DIST, 'games', 'polywordlot')),
    transword: hashTree(path.join(DIST, 'games', 'transword')),
  };

  const siteFiles = hashTree(DIST);
  const siteHash = crypto.createHash('sha256').update(JSON.stringify(siteFiles)).digest('hex').slice(0, 16);

  const words = {};
  for (const lang of catalog) {
    if (lang.polyDir) words[`polywordlot:${lang.code}`] = gameHashes.polywordlot[`dict/${lang.polyDir}/language.json`] || siteHash;
    if (lang.transwordDir) words[`transword:${lang.code}`] = gameHashes.transword[`data/languages/${lang.transwordDir}/corpus.txt`] || siteHash;
  }

  const commit = gitCommit();
  const manifest = {
    builtAt: new Date().toISOString(),
    siteHash,
    commit,
    games: {
      polywordlot: {
        hash: crypto.createHash('sha256').update(JSON.stringify(gameHashes.polywordlot)).digest('hex').slice(0, 16),
      },
      transword: {
        hash: crypto.createHash('sha256').update(JSON.stringify(gameHashes.transword)).digest('hex').slice(0, 16),
      },
    },
    words,
  };

  fs.writeFileSync(path.join(DIST, 'deployment-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Build complete → dist/ (siteHash=${siteHash}, languages=${catalog.length})`);
}

main();
