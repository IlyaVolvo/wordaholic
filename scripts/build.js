/**
 * Build static site: sync is separate; copy assets; catalog from native game dicts.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { buildLanguagesCatalog } from './build-languages-catalog.js';
import { embedAdminPassword } from './embed-admin-password.js';

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

function copyDir(src, dest, { skipNames = ['.DS_Store'] } = {}) {
  if (!fs.existsSync(src)) {
    throw new Error(`Missing directory: ${src}`);
  }
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skipNames.includes(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to, { skipNames });
    else fs.copyFileSync(from, to);
  }
}

function hashFile(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

function isUnstampedCommit(commit) {
  const value = String(commit || '').trim();
  return !value || value === 'HEAD';
}

/**
 * Freeze at most one HEAD/empty announcement to this build's git SHA.
 * Writes source and dist so the runtime catalog identity is stable.
 * @param {string} commit
 */
function stampAnnouncements(commit) {
  const srcPath = path.join(ROOT, 'app/announcements.json');
  const distPath = path.join(DIST, 'app/announcements.json');
  if (!fs.existsSync(srcPath)) return;
  const notes = JSON.parse(fs.readFileSync(srcPath, 'utf8'));
  if (!Array.isArray(notes)) {
    throw new Error('app/announcements.json must be an array');
  }
  const unstamped = notes.filter((note) => note && isUnstampedCommit(note.commit));
  if (unstamped.length > 1) {
    throw new Error('Only one announcement may use commit HEAD per build');
  }
  if (!unstamped.length) return;
  if (!commit) {
    throw new Error('Cannot stamp announcement: git commit is unknown');
  }
  unstamped[0].commit = commit;
  const json = `${JSON.stringify(notes, null, 2)}\n`;
  fs.writeFileSync(srcPath, json);
  ensureDir(path.dirname(distPath));
  fs.writeFileSync(distPath, json);
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
  const commit = gitCommit();
  stampAnnouncements(commit);
  // Shared language definitions for all games (skip local master.json lists)
  copyDir(path.join(ROOT, 'word-data'), path.join(DIST, 'word-data'), {
    skipNames: ['.DS_Store', 'master.json'],
  });
  fs.copyFileSync(path.join(ROOT, 'app/updates/service-worker.js'), path.join(DIST, 'sw.js'));

  // TransWord stays static; PolyWordlot is a Vite+React build of the mlw UI.
  copyDir(path.join(ROOT, 'games/transword'), path.join(DIST, 'games/transword'));
  embedAdminPassword(path.join(DIST, 'games/transword/admin'));
  console.log('Building PolyWordlot (mlw React port)…');
  execSync('npx vite build --config games/polywordlot/vite.config.ts', {
    cwd: ROOT,
    stdio: 'inherit',
  });
  copyDir(path.join(ROOT, 'games/polywordlot/dict'), path.join(DIST, 'games/polywordlot/dict'));

  console.log('Building PolyHydra…');
  execSync('npx vite build --config games/polyhydra/vite.config.ts', {
    cwd: ROOT,
    stdio: 'inherit',
  });

  const catalog = buildLanguagesCatalog();
  ensureDir(path.join(DIST, 'data'));
  fs.writeFileSync(path.join(DIST, 'data/languages.json'), JSON.stringify(catalog, null, 2));

  const gameHashes = {
    polywordlot: hashTree(path.join(DIST, 'games', 'polywordlot')),
    polyhydra: hashTree(path.join(DIST, 'games', 'polyhydra')),
    transword: hashTree(path.join(DIST, 'games', 'transword')),
  };
  const wordDataHashes = hashTree(path.join(DIST, 'word-data'));

  const siteFiles = hashTree(DIST);
  const siteHash = crypto.createHash('sha256').update(JSON.stringify(siteFiles)).digest('hex').slice(0, 16);

  const words = {};
  for (const lang of catalog) {
    const langJsonRel = lang.wordDir ? `${lang.wordDir}/language.json` : null;
    const langHash = langJsonRel ? wordDataHashes[langJsonRel] : null;
    if (lang.polyDir) {
      const dictPrefix = `dict/${lang.polyDir}/`;
      for (const [rel, hash] of Object.entries(gameHashes.polywordlot)) {
        const match = /^dict\/.+\/answers-(\d+)\.txt$/.exec(rel);
        if (match && rel.startsWith(dictPrefix)) {
          words[`polywordlot:${lang.code}:${match[1]}`] = hash;
        }
      }
      words[`polywordlot:${lang.code}`] =
        words[`polywordlot:${lang.code}:5`] ||
        langHash ||
        siteHash;
    }
    if (lang.transwordDir) words[`transword:${lang.code}`] = gameHashes.transword[`data/languages/${lang.transwordDir}/corpus.txt`] || siteHash;
    if (langHash) words[`language:${lang.code}`] = langHash;
  }

  const manifest = {
    builtAt: new Date().toISOString(),
    siteHash,
    commit,
    games: {
      polywordlot: {
        hash: crypto.createHash('sha256').update(JSON.stringify(gameHashes.polywordlot)).digest('hex').slice(0, 16),
      },
      polyhydra: {
        hash: crypto.createHash('sha256').update(JSON.stringify(gameHashes.polyhydra)).digest('hex').slice(0, 16),
      },
      transword: {
        hash: crypto.createHash('sha256').update(JSON.stringify(gameHashes.transword)).digest('hex').slice(0, 16),
      },
    },
    words,
  };

  fs.writeFileSync(path.join(DIST, 'deployment-manifest.json'), JSON.stringify(manifest, null, 2));

  const swPath = path.join(DIST, 'sw.js');
  const sw = fs.readFileSync(swPath, 'utf8').replace(
    /const CACHE_SHELL = ['"][^'"]+['"]/,
    `const CACHE_SHELL = 'wordaholic-shell-${siteHash}'`
  );
  fs.writeFileSync(swPath, sw);

  console.log(`Build complete → dist/ (siteHash=${siteHash}, languages=${catalog.length})`);
}

main();
