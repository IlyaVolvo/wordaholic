/**
 * Letter frequency for a game’s word list, per language.
 *
 * Usage:
 *   node scripts/letter-frequency.js <game> [code] [--md]
 *   node scripts/letter-frequency.js letterix [--write] [code]
 *   node scripts/letter-frequency.js letterix --write-staged
 *
 *   code           one language; omit it for every language the game supports
 *   --md           print Markdown
 *   --write        write games/public/<game>/letter_frequency.json from the corpus on disk
 *   --write-staged update that file from staged corpus.txt blobs and git-add it
 *
 * Letterix counts games/<group>/data/languages/<Language>/corpus.txt only.
 * corpus2.txt is playable and is not counted. The commit hook runs --write-staged
 * when any corpus.txt is staged.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getGame, gameGroup } from '../app/games-contract.js';
import '../app/game-registry.js';
import { codeForLanguageName, languageDirForCode } from '../app/shell/locales.js';
import { languageHooks } from '../app/i18n/languages/index.js';
import { normalizeWithMappings } from '../app/i18n/normalize.js';
import { buildLexicon } from '../games/g3/letterix/src/lexicon.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/**
 * Each game reads its word file the way the game itself does, and reports
 * counts (and letter values, when the game has them) from the same code.
 */
const GAMES = {
  letterix: {
    name: 'Letterix',
    file: (languageName) => `games/${gameGroup('letterix')}/data/languages/${languageName}/corpus.txt`,
    /** Frequency is corpus.txt only. corpus2.txt words are playable and are not counted. */
    words: (text) => text.split(/\n/).map((line) => line.trim()).filter(Boolean),
    /** Same options as loadLexicon: base letters and one-letter folds are what fall. */
    count(words, langJson, langCode) {
      const { baseLetter } = languageHooks(langCode);
      const mappings = langJson.normalization && typeof langJson.normalization === 'object' ? langJson.normalization : {};
      const lex = buildLexicon(words, (word) => normalizeWithMappings(word, mappings), { baseLetter, rtl: langJson.rtl === true });
      return {
        counts: new Map(lex.table.map((row) => [row.letter, row.freq])),
        values: lex.values,
      };
    },
  },
};

const USAGE = `Usage: node scripts/letter-frequency.js <game> [code] [--md|--write|--write-staged]   games: ${Object.keys(GAMES).join(', ')}`;

const shown = (ch) => (ch === ' ' ? '(space)' : ch === '\t' ? '(tab)' : ch);
const num = (n) => n.toLocaleString('en-US');
const pct = (r, n) => `${((n / r.total) * 100).toFixed(2)}%`;
const valueText = (r, ch) => (r.values ? r.values[ch].toFixed(1) : '');

/** @param {string} relPath */
function corpusLanguage(relPath) {
  const group = gameGroup('letterix');
  if (!group) return null;
  const match = new RegExp(`^games/${group}/data/languages/([^/]+)/corpus\\.txt$`).exec(relPath);
  return match ? match[1] : null;
}

/** @param {string} gameId */
function publicFile(gameId) {
  return `games/public/${gameId}/letter_frequency.json`;
}

/**
 * @param {string} langCode
 * @param {string} text
 * @param {string} relFile
 */
function analyzeText(langCode, text, relFile) {
  const languageName = languageDirForCode(langCode);
  if (!languageName) return { error: `Unknown language "${langCode}".` };
  const words = GAMES.letterix.words(text);
  if (!words.length) return { error: `${relFile} is empty.` };

  const langJsonPath = path.join(ROOT, 'word-data', languageName, 'language.json');
  const langJson = fs.existsSync(langJsonPath) ? JSON.parse(fs.readFileSync(langJsonPath, 'utf8')) : {};
  const { counts, values } = GAMES.letterix.count(words, langJson, langCode);
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  const rows = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const strays = rows.filter(([ch]) => !/\p{L}/u.test(ch));

  const merged = new Map();
  for (const [from, to] of Object.entries(langJson.normalization || {})) {
    if (from === to || !counts.has(from)) continue;
    const group = merged.get(to) || [to];
    group.push(from);
    merged.set(to, group);
  }
  const groups = [...merged.values()]
    .map((group) => ({ group, n: group.reduce((sum, ch) => sum + (counts.get(ch) || 0), 0) }))
    .sort((a, b) => b.n - a.n);

  const { baseLetter } = languageHooks(langCode);
  const finals = [...new Set(words.flatMap((word) => Array.from(word.toLowerCase())))]
    .filter((ch) => baseLetter(ch) !== ch)
    .sort((a, b) => a.localeCompare(b));
  return { langCode, languageName, relFile, words, counts, values, total, rows, strays, groups, finals };
}

/** @param {string} langCode */
function analyzeFile(langCode) {
  const game = GAMES.letterix;
  const languageName = languageDirForCode(langCode);
  if (!languageName) return { error: `Unknown language "${langCode}".` };
  const relFile = game.file(languageName);
  const absFile = path.join(ROOT, relFile);
  if (!fs.existsSync(absFile)) return { error: `${game.name} has no word list for "${langCode}" (${relFile}).` };
  return analyzeText(langCode, fs.readFileSync(absFile, 'utf8'), relFile);
}

/** @param {ReturnType<typeof analyzeText>} r */
function languageSection(r) {
  return {
    language: r.languageName,
    code: r.langCode,
    source: r.relFile,
    words: r.words.length,
    letters: r.total,
    distinct: r.rows.length,
    byFrequency: r.rows.map(([letter, count]) => ({
      letter,
      count,
      share: Math.round((count / r.total) * 10000) / 100,
      ...(r.values ? { value: Math.round(r.values[letter] * 10) / 10 } : {}),
    })),
  };
}

/** @param {string} gameId */
function readLanguages(gameId) {
  const abs = path.join(ROOT, publicFile(gameId));
  if (!fs.existsSync(abs)) return {};
  const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const languages = data && data.languages && typeof data.languages === 'object' ? data.languages : {};
  return { ...languages };
}

/**
 * @param {string} gameId
 * @param {Record<string, object>} languages
 */
function writeCombined(gameId, languages) {
  const preferred = getGame(gameId)?.languages || [];
  /** @type {Record<string, object>} */
  const ordered = {};
  for (const code of preferred) {
    if (languages[code]) ordered[code] = languages[code];
  }
  for (const code of Object.keys(languages).sort()) {
    if (!ordered[code]) ordered[code] = languages[code];
  }
  const rel = publicFile(gameId);
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${JSON.stringify({ game: gameId, languages: ordered }, null, 2)}\n`);
  return rel;
}

/** Drop the earlier per-language files, once the combined report exists. */
function removeSplitFiles(gameId) {
  const dir = path.join(ROOT, 'games', 'public', gameId);
  if (!fs.existsSync(dir)) return [];
  /** @type {string[]} */
  const removed = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json') || name === 'letter_frequency.json') continue;
    fs.unlinkSync(path.join(dir, name));
    removed.push(`games/public/${gameId}/${name}`);
  }
  return removed;
}

/**
 * @param {string} gameId
 * @param {{ langCode: string, relFile: string, text: string }[]} sources
 * @param {string[]} [removeCodes] language sections to drop
 * @param {{ replace?: boolean }} [options] replace drops languages that are not in sources
 */
function writeFrequencies(gameId, sources, removeCodes = [], options = {}) {
  const reports = sources.map((source) => {
    const report = analyzeText(source.langCode, source.text, source.relFile);
    if (report.error) {
      console.error(report.error);
      process.exit(1);
    }
    return report;
  });
  /** @type {Record<string, object>} */
  const languages = options.replace ? {} : readLanguages(gameId);
  for (const report of reports) {
    if (report.strays.length) {
      console.error(
        `Warning: ${report.relFile} has characters that are not letters, and Letterix counts them as letters: ` +
          report.strays.map(([ch, n]) => `${JSON.stringify(ch)} ×${n}`).join(', '),
      );
    }
    languages[report.langCode] = languageSection(report);
  }
  for (const langCode of removeCodes) delete languages[langCode];
  const rel = writeCombined(gameId, languages);
  removeSplitFiles(gameId);
  return [rel];
}

function stagedChanges() {
  const out = execFileSync('git', ['diff', '--cached', '--name-status', '--find-renames', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const parts = out.split('\0');
  /** @type {{ status: string, path: string, oldPath?: string }[]} */
  const rows = [];
  for (let i = 0; i < parts.length; i++) {
    const status = parts[i];
    if (!status) continue;
    const code = status[0];
    if (code === 'R' || code === 'C') {
      const oldPath = parts[++i];
      rows.push({ status: code, oldPath, path: parts[++i] });
    } else {
      rows.push({ status: code, path: parts[++i] });
    }
  }
  return rows;
}

/** @param {string} relPath */
function stagedText(relPath) {
  return execFileSync('git', ['show', `:${relPath}`], { cwd: ROOT, encoding: 'utf8' });
}

/**
 * Refresh public files for Letterix corpora in the index, then stage those files.
 * Other games’ corpus.txt files do not change Letterix frequencies.
 */
function writeStaged(gameId) {
  /** @type {Map<string, { langCode: string, relFile: string, text: string }>} */
  const sources = new Map();
  /** @type {Set<string>} */
  const removed = new Set();
  for (const change of stagedChanges()) {
    if (change.status === 'D' || change.status === 'R') {
      const relPath = change.status === 'D' ? change.path : change.oldPath;
      const languageName = relPath ? corpusLanguage(relPath) : null;
      if (languageName) {
        const langCode = codeForLanguageName(languageName);
        if (!langCode) {
          console.error(`${relPath} has no language code.`);
          process.exit(1);
        }
        removed.add(langCode);
      }
    }
    if (change.status === 'D') continue;
    const languageName = corpusLanguage(change.path);
    if (!languageName) continue;
    const langCode = codeForLanguageName(languageName);
    if (!langCode) {
      console.error(`${change.path} has no language code.`);
      process.exit(1);
    }
    removed.delete(langCode);
    sources.set(langCode, { langCode, relFile: change.path, text: stagedText(change.path) });
  }
  if (!sources.size && !removed.size) return [];
  const existing = readLanguages(gameId);
  const game = GAMES[gameId];
  for (const langCode of getGame(gameId)?.languages || []) {
    if (sources.has(langCode) || removed.has(langCode) || existing[langCode]) continue;
    const languageName = languageDirForCode(langCode);
    if (!languageName || !game) continue;
    const relFile = game.file(languageName);
    const absFile = path.join(ROOT, relFile);
    if (!fs.existsSync(absFile)) continue;
    sources.set(langCode, { langCode, relFile, text: fs.readFileSync(absFile, 'utf8') });
  }
  const changed = writeFrequencies(gameId, [...sources.values()], [...removed]);
  if (changed.length) execFileSync('git', ['add', '-A', '--', `games/public/${gameId}`], { cwd: ROOT, stdio: 'inherit' });
  return changed;
}

function printReports(game, gameId, code, markdown) {
  const codes = code ? [code] : getGame(gameId)?.languages || [];
  if (!codes.length) {
    console.error(`${game.name} lists no languages.`);
    process.exit(1);
  }
  const reports = codes.map(analyzeFile);
  let failed = false;
  for (const r of reports) {
    if (r.error) {
      console.error(r.error);
      failed = true;
    } else if (r.strays.length) {
      console.error(
        `Warning: ${r.relFile} has characters that are not letters, and ${game.name} counts them as letters: ` +
          r.strays.map(([ch, n]) => `${JSON.stringify(ch)} ×${n}`).join(', '),
      );
    }
  }
  const ok = reports.filter((r) => !r.error);
  if (!ok.length) process.exit(1);

  if (!markdown) {
    for (const [i, r] of ok.entries()) {
      if (i) console.log('');
      const countWidth = String(r.rows[0]?.[1] ?? 0).length;
      console.log(`${game.name}, ${r.languageName} (${r.langCode}): ${r.words.length} words, ${r.total} letters, ${r.rows.length} distinct`);
      for (const [letter, n] of r.rows) {
        const cols = [shown(letter).padEnd(7), String(n).padStart(countWidth), pct(r, n).padStart(7)];
        if (r.values) cols.push(`value ${valueText(r, letter).padStart(4)}`);
        console.log(cols.join('  '));
      }
    }
    process.exit(failed ? 1 : 0);
  }

  const lines = [
    `# ${game.name} letter frequency`,
    '',
    `Generated with \`node scripts/letter-frequency.js ${gameId}${code ? ` ${code}` : ''} --md\`.`,
  ];
  if (ok.some((r) => r.values)) {
    lines.push('Value is the letter’s base points in the game: 1 for the most common letter, 10 for the rarest.');
  }
  for (const r of ok) {
    lines.push(
      '',
      `## ${r.languageName} (${r.langCode})`,
      '',
      `Source: \`${r.relFile}\` — ${num(r.words.length)} words, ${num(r.total)} letters, ${r.rows.length} distinct.`,
    );
    if (r.finals.length) {
      lines.push('', `Positional forms (${r.finals.join(' ')}) never fall; each is counted as its base letter.`);
    }
    if (r.strays.length) {
      lines.push('', `**Warning:** the file has characters that are not letters, and ${game.name} counts them as letters: ${r.strays.map(([ch]) => shown(ch)).join(', ')}.`);
    }
    lines.push(
      '',
      r.values ? '| Rank | Letter | Count | Share | Value |' : '| Rank | Letter | Count | Share |',
      r.values ? '|---|---|---|---|---|' : '|---|---|---|---|',
      ...r.rows.map(([letter, n], i) =>
        `| ${i + 1} | ${shown(letter)} | ${num(n)} | ${pct(r, n)} |${r.values ? ` ${valueText(r, letter)} |` : ''}`,
      ),
    );
    if (r.groups.length) {
      lines.push(
        '',
        `### ${r.languageName}: letters the dictionary treats as one`,
        '',
        'Counted separately above. Merged here for comparison:',
        '',
        '| Letters | Count | Share |',
        '|---|---|---|',
        ...r.groups.map(({ group, n }) => `| ${group.join(' + ')} | ${num(n)} | ${pct(r, n)} |`),
      );
    }
  }

  console.log(lines.join('\n'));
  if (failed) process.exit(1);
}

function main() {
  const args = process.argv.slice(2);
  const markdown = args.includes('--md');
  const write = args.includes('--write');
  const writeFromIndex = args.includes('--write-staged');
  const [gameId = '', code = ''] = args.filter((a) => !a.startsWith('--')).map((a) => a.trim().toLowerCase());
  const game = GAMES[gameId];
  if (!game) {
    console.error(USAGE);
    process.exit(1);
  }
  if (writeFromIndex) {
    const changed = writeStaged(gameId);
    if (changed.length) console.log(changed.join('\n'));
    return;
  }
  if (write) {
    const codes = code ? [code] : getGame(gameId)?.languages || [];
    if (!codes.length) {
      console.error(`${game.name} lists no languages.`);
      process.exit(1);
    }
    /** @type {{ langCode: string, relFile: string, text: string }[]} */
    const sources = [];
    for (const langCode of codes) {
      const languageName = languageDirForCode(langCode);
      if (!languageName) {
        console.error(`Unknown language "${langCode}".`);
        process.exit(1);
      }
      const relFile = game.file(languageName);
      const absFile = path.join(ROOT, relFile);
      if (!fs.existsSync(absFile)) {
        console.error(`${game.name} has no word list for "${langCode}" (${relFile}).`);
        process.exit(1);
      }
      sources.push({ langCode, relFile, text: fs.readFileSync(absFile, 'utf8') });
    }
    const changed = writeFrequencies(gameId, sources, [], { replace: !code });
    console.log(changed.join('\n'));
    return;
  }
  printReports(game, gameId, code, markdown);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
