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
import { writeGamesLayout } from './games-layout.js';
import { gameGroup } from '../app/games-contract.js';

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

/** Vite empties its outDir, so each game's registration.js is copied afterward. */
function copyGameRegistrations(groups) {
  for (const [group, ids] of Object.entries(groups)) {
    for (const id of ids) {
      const srcDir = path.join(ROOT, 'games', group, id);
      const destDir = path.join(DIST, 'games', group, id);
      ensureDir(destDir);
      fs.copyFileSync(path.join(srcDir, 'registration.js'), path.join(destDir, 'registration.js'));
      const helpSrc = path.join(srcDir, 'help');
      if (fs.existsSync(helpSrc)) copyDir(helpSrc, path.join(destDir, 'help'));
    }
  }
}

/** Games without a vite.config.ts are served as-is, along with their group's shared/ loader. */
function isStaticGame(group, id) {
  return !fs.existsSync(path.join(ROOT, 'games', group, id, 'vite.config.ts'));
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
  const groups = writeGamesLayout();
  const pwDict = path.join(ROOT, 'games', gameGroup('polywordlot'), 'data/languages');
  const twLangs = path.join(ROOT, 'games', gameGroup('transword'), 'data/languages');
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

  for (const [group, ids] of Object.entries(groups)) {
    const groupSrc = path.join(ROOT, 'games', group);
    const groupDist = path.join(DIST, 'games', group);
    if (fs.existsSync(path.join(groupSrc, 'data'))) copyDir(path.join(groupSrc, 'data'), path.join(groupDist, 'data'));
    for (const id of ids) {
      if (isStaticGame(group, id)) {
        copyDir(path.join(groupSrc, id), path.join(groupDist, id));
        if (fs.existsSync(path.join(groupSrc, 'shared'))) copyDir(path.join(groupSrc, 'shared'), path.join(groupDist, 'shared'));
      } else {
        console.log(`Building ${group}/${id}…`);
        execSync(`npx vite build --config games/${group}/${id}/vite.config.ts`, { cwd: ROOT, stdio: 'inherit' });
      }
    }
  }
  embedAdminPassword(path.join(DIST, 'games', gameGroup('transword'), 'transword/admin'));
  copyGameRegistrations(groups);

  const catalog = buildLanguagesCatalog();
  ensureDir(path.join(DIST, 'data'));
  fs.writeFileSync(path.join(DIST, 'data/languages.json'), JSON.stringify(catalog, null, 2));

  /** @type {Record<string, Record<string, string>>} */
  const gameHashes = {};
  /** @type {Record<string, Record<string, string>>} group → { 'data/languages/…': hash } */
  const groupDataHashes = {};
  for (const [group, ids] of Object.entries(groups)) {
    groupDataHashes[group] = hashTree(path.join(DIST, 'games', group, 'data'), 'data');
    for (const id of ids) gameHashes[id] = hashTree(path.join(DIST, 'games', group, id));
  }
  const wordsOf = (id) => groupDataHashes[gameGroup(id)] || {};
  const wordDataHashes = hashTree(path.join(DIST, 'word-data'));

  const siteFiles = hashTree(DIST);
  const siteHash = crypto.createHash('sha256').update(JSON.stringify(siteFiles)).digest('hex').slice(0, 16);

  const words = {};
  for (const lang of catalog) {
    const langJsonRel = lang.wordDir ? `${lang.wordDir}/language.json` : null;
    const langHash = langJsonRel ? wordDataHashes[langJsonRel] : null;
    if (lang.polyDir) {
      const dictPrefix = `data/languages/${lang.polyDir}/`;
      for (const [rel, hash] of Object.entries(wordsOf('polywordlot'))) {
        const match = /^data\/languages\/.+\/answers-(\d+)\.txt$/.exec(rel);
        if (match && rel.startsWith(dictPrefix)) {
          words[`polywordlot:${lang.code}:${match[1]}`] = hash;
        }
      }
      words[`polywordlot:${lang.code}`] =
        words[`polywordlot:${lang.code}:5`] ||
        langHash ||
        siteHash;
    }
    if (lang.transwordDir) words[`transword:${lang.code}`] = wordsOf('transword')[`data/languages/${lang.transwordDir}/corpus.txt`] || siteHash;
    if (lang.letterixDir) {
      const primary = wordsOf('letterix')[`data/languages/${lang.letterixDir}/corpus.txt`];
      const extra = wordsOf('letterix')[`data/languages/${lang.letterixDir}/corpus2.txt`] || '';
      words[`letterix:${lang.code}`] = primary
        ? crypto.createHash('sha256').update(`${primary}\n${extra}`).digest('hex').slice(0, 16)
        : siteHash;
    }
    if (langHash) words[`language:${lang.code}`] = langHash;
  }

  const manifest = {
    builtAt: new Date().toISOString(),
    siteHash,
    commit,
    games: Object.fromEntries(
      Object.entries(gameHashes).map(([id, files]) => [
        id,
        { hash: crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 16) },
      ])
    ),
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
