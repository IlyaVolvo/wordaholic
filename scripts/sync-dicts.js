/**
 * Copy dictionaries from sibling old repos into each game with the original layout:
 *   games/polywordlot/dict/<Language>/<locale>/...
 *   games/transword/data/languages/<Dir>/...
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MLW_DICT = path.resolve(ROOT, '../mlw/public/dict');
const TW_LANGS = path.resolve(ROOT, '../transword/data/languages');

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
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

function main() {
  if (!fs.existsSync(MLW_DICT)) {
    console.error(`Missing PolyWordlot source dicts: ${MLW_DICT}`);
    process.exit(1);
  }
  if (!fs.existsSync(TW_LANGS)) {
    console.error(`Missing TransWord source languages: ${TW_LANGS}`);
    process.exit(1);
  }

  const pwDict = path.join(ROOT, 'games/polywordlot/dict');
  const twData = path.join(ROOT, 'games/transword/data/languages');

  console.log('Syncing PolyWordlot dict → games/polywordlot/dict');
  rmrf(pwDict);
  copyDir(MLW_DICT, pwDict);

  console.log('Syncing TransWord languages → games/transword/data/languages');
  rmrf(twData);
  copyDir(TW_LANGS, twData);

  console.log('Done.');
}

main();
