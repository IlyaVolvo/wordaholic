/**
 * Build shell /data/languages.json by scanning game word trees + shared word-data language.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALE_PATHS, languageDirForCode } from '../app/shell/locales.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const MAP_COORDS = {
  en: { lat: 39, lon: -98 },
  es: { lat: 40, lon: -3.7 },
  fr: { lat: 46.5, lon: 2.5 },
  de: { lat: 51.2, lon: 10.4 },
  ru: { lat: 55.7, lon: 37.6 },
  he: { lat: 31.5, lon: 34.8 },
  hy: { lat: 40.2, lon: 44.5 },
};

/** @param {unknown} raw */
function blockedGameIds(raw) {
  if (raw === true) return ['transword'];
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase();
    if (v === 'yes' || v === 'true') return ['transword'];
    return v ? [v] : [];
  }
  if (Array.isArray(raw)) return raw.map((id) => String(id)).filter(Boolean);
  return [];
}

function polyLengths(dictRoot, language, locale) {
  const dir = path.join(dictRoot, language, locale);
  if (!fs.existsSync(dir)) return [];
  const lengths = [];
  for (let len = 3; len <= 10; len++) {
    if (fs.existsSync(path.join(dir, `answers-${len}.txt`))) lengths.push(len);
  }
  return lengths;
}

export function buildLanguagesCatalog() {
  const pwDict = path.join(ROOT, 'games/polywordlot/dict');
  const wordData = path.join(ROOT, 'word-data');
  const twIndexPath = path.join(ROOT, 'games/transword/data/languages/index.json');
  /** @type {Map<string, any>} */
  const byCode = new Map();

  for (const [code, { language, locale }] of Object.entries(LOCALE_PATHS)) {
    const wordDir = languageDirForCode(code);
    const langJsonPath = path.join(wordData, language, locale, 'language.json');
    const lengths = polyLengths(pwDict, language, locale);
    if (!lengths.length && !fs.existsSync(langJsonPath)) continue;
    let meta = { menu: language, flag: '' };
    if (fs.existsSync(langJsonPath)) {
      meta = { ...meta, ...JSON.parse(fs.readFileSync(langJsonPath, 'utf8')) };
    }
    const games = lengths.length ? ['polywordlot'] : [];
    const coords = MAP_COORDS[code] || { lat: 0, lon: 0 };
    byCode.set(code, {
      code,
      menu: meta.menu || language,
      flag: meta.flag || '',
      lat: coords.lat,
      lon: coords.lon,
      games,
      polywordlotLengths: lengths,
      polyDir: `${language}/${locale}`,
      wordDir,
      blockedIds: blockedGameIds(meta.blocked),
    });
  }

  if (fs.existsSync(twIndexPath)) {
    const twIndex = JSON.parse(fs.readFileSync(twIndexPath, 'utf8'));
    for (const entry of twIndex) {
      const code = entry.code;
      const corpusPath = path.join(ROOT, 'games/transword/data/languages', entry.dir, 'corpus.txt');
      const hasWords = fs.existsSync(corpusPath) && fs.statSync(corpusPath).size > 0;
      if (!hasWords) continue;
      const wordDir = languageDirForCode(code) || `${entry.dir}/${code}`;
      const existing = byCode.get(code) || {
        code,
        menu: entry.menu,
        flag: entry.flag || '',
        lat: (MAP_COORDS[code] || {}).lat || 0,
        lon: (MAP_COORDS[code] || {}).lon || 0,
        games: [],
        polywordlotLengths: [],
        wordDir,
      };
      if (!existing.games.includes('transword')) existing.games.push('transword');
      existing.transwordDir = entry.dir;
      existing.wordDir = existing.wordDir || wordDir;
      existing.menu = existing.menu || entry.menu;
      existing.flag = existing.flag || entry.flag || '';
      if (!existing.blockedIds) {
        const langJsonPath = path.join(wordData, wordDir, 'language.json');
        if (fs.existsSync(langJsonPath)) {
          const meta = JSON.parse(fs.readFileSync(langJsonPath, 'utf8'));
          existing.blockedIds = blockedGameIds(meta.blocked);
        } else {
          existing.blockedIds = [];
        }
      }
      byCode.set(code, existing);
    }
  }

  return [...byCode.values()]
    .map((l) => {
      const blocked = l.blockedIds || [];
      const { blockedIds, ...rest } = l;
      return {
        ...rest,
        games: (l.games || []).filter((g) => !blocked.includes(g)),
      };
    })
    .filter((l) => l.games.length > 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const catalog = buildLanguagesCatalog();
  console.log(JSON.stringify(catalog, null, 2));
}
