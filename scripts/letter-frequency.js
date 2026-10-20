/**
 * Print how often each letter occurs in the word list a game uses, per language.
 *
 * Usage: node scripts/letter-frequency.js <game> [code] [--md]   e.g. letterix, letterix en
 *   code  one language; omit it for every language the game supports
 *   --md  print Markdown (docs/letter-frequency-letterix.md is generated this way)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getGame } from '../app/games-contract.js';
import '../app/game-registry.js';
import { languageDirForCode } from '../app/shell/locales.js';
import { buildLexicon } from '../games/letterix/src/lexicon.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/**
 * Each game reads its word file the way the game itself does, and reports
 * counts (and letter values, when the game has them) from the same code.
 */
const GAMES = {
  letterix: {
    name: 'Letterix',
    file: (languageName) => `games/letterix/data/languages/${languageName}/corpus.txt`,
    /** Same as loadLexicon in games/letterix/src/App.tsx: every non-empty trimmed line is a word. */
    words: (text) => text.split(/\n/).map((line) => line.trim()).filter(Boolean),
    count(words) {
      const lex = buildLexicon(words, (word) => word);
      return {
        counts: new Map(lex.table.map((row) => [row.letter, row.freq])),
        values: lex.values,
      };
    },
  },
};

const USAGE = `Usage: node scripts/letter-frequency.js <game> [code] [--md]   games: ${Object.keys(GAMES).join(', ')}`;

const args = process.argv.slice(2);
const markdown = args.includes('--md');
const [gameId = '', code = ''] = args.filter((a) => !a.startsWith('--')).map((a) => a.trim().toLowerCase());
const game = GAMES[gameId];
if (!game) {
  console.error(USAGE);
  process.exit(1);
}

const codes = code ? [code] : getGame(gameId)?.languages || [];
if (!codes.length) {
  console.error(`${game.name} lists no languages.`);
  process.exit(1);
}

const shown = (ch) => (ch === ' ' ? '(space)' : ch === '\t' ? '(tab)' : ch);
const num = (n) => n.toLocaleString('en-US');

/** @param {string} langCode */
function analyze(langCode) {
  const wordDir = languageDirForCode(langCode);
  if (!wordDir) return { error: `Unknown language "${langCode}".` };
  const languageName = wordDir.split('/')[0];
  const relFile = game.file(languageName);
  const absFile = path.join(ROOT, relFile);
  if (!fs.existsSync(absFile)) return { error: `${game.name} has no word list for "${langCode}" (${relFile}).` };
  const words = game.words(fs.readFileSync(absFile, 'utf8'));
  if (!words.length) return { error: `${relFile} is empty.` };

  const { counts, values } = game.count(words);
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  const rows = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const strays = rows.filter(([ch]) => !/\p{L}/u.test(ch));

  const langJsonPath = path.join(ROOT, 'word-data', wordDir, 'language.json');
  const langJson = fs.existsSync(langJsonPath) ? JSON.parse(fs.readFileSync(langJsonPath, 'utf8')) : {};
  const merged = new Map();
  for (const [from, to] of Object.entries(langJson.normalization || {})) {
    if (from === to) continue;
    const group = merged.get(to) || [to];
    group.push(from);
    merged.set(to, group);
  }
  const groups = [...merged.values()]
    .map((group) => ({ group, n: group.reduce((sum, ch) => sum + (counts.get(ch) || 0), 0) }))
    .sort((a, b) => b.n - a.n);

  return { langCode, languageName, relFile, words, counts, values, total, rows, strays, groups };
}

const reports = codes.map(analyze);
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

const pct = (r, n) => `${((n / r.total) * 100).toFixed(2)}%`;
const value = (r, ch) => (r.values ? r.values[ch].toFixed(1) : '');

if (!markdown) {
  for (const [i, r] of ok.entries()) {
    if (i) console.log('');
    const countWidth = String(r.rows[0]?.[1] ?? 0).length;
    console.log(`${game.name}, ${r.languageName} (${r.langCode}): ${r.words.length} words, ${r.total} letters, ${r.rows.length} distinct`);
    for (const [letter, n] of r.rows) {
      const cols = [shown(letter).padEnd(7), String(n).padStart(countWidth), pct(r, n).padStart(7)];
      if (r.values) cols.push(`value ${value(r, letter).padStart(4)}`);
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
  if (r.strays.length) {
    lines.push('', `**Warning:** the file has characters that are not letters, and ${game.name} counts them as letters: ${r.strays.map(([ch]) => shown(ch)).join(', ')}.`);
  }
  lines.push(
    '',
    r.values ? '| Rank | Letter | Count | Share | Value |' : '| Rank | Letter | Count | Share |',
    r.values ? '|---|---|---|---|---|' : '|---|---|---|---|',
    ...r.rows.map(([letter, n], i) =>
      `| ${i + 1} | ${shown(letter)} | ${num(n)} | ${pct(r, n)} |${r.values ? ` ${value(r, letter)} |` : ''}`,
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
