/**
 * Check word lists before they are committed.
 *
 * Every word may use only the letters of that language's keyboard
 * (word-data/<Language>/language.json), plus letters the keyboard folds
 * onto those keys (ё, é, a Hebrew final letter, ß, …).
 *
 * A group can add its own limits:
 *   g1  the word's length is the number in answers-N.txt / dictionary-N.txt
 *   g2  an optional level after the word is a positive integer, not part of the word
 *   g3  one word per line; a `#` note may follow it, and nothing else may
 *
 *   node scripts/verify-words.js            every word list
 *   node scripts/verify-words.js --staged   word lists in the index (used by the commit hook)
 *   node scripts/verify-words.js <file...>  those files
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeWithMappings } from '../app/i18n/normalize.js';
import { codeForLanguageName } from '../app/shell/locales.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORD_FILE = /^games\/(g\d+)\/data\/languages\/([^/]+)\/([^/]+\.txt)$/;
const G1_LENGTH = /^(?:answers|dictionary)-(\d+)\.txt$/;
const MAX_SHOWN = 40;

/**
 * Extra limits on top of the shared keyboard alphabet.
 * `exactLength` reads N from the file name. `level` is the g2 corpus field.
 * `bareWord` rejects anything after the word except a `#` note.
 */
export const GROUP_RULES = {
  g1: { exactLength: true },
  g2: { level: true },
  g3: { bareWord: true },
};

/** @param {object} language */
export function keyboardLetters(language) {
  const letters = new Set();
  for (const row of language?.layout || []) {
    if (!Array.isArray(row)) continue;
    for (const key of row) {
      for (const ch of Array.from(String(key || '').toLowerCase())) {
        if (ch.trim()) letters.add(ch);
      }
    }
  }
  return letters;
}

/**
 * Keyboard letters plus normalization sources that fold onto those letters.
 * @param {object} language
 */
export function acceptedLetters(language) {
  const letters = keyboardLetters(language);
  const accepted = new Set(letters);
  const mappings = language?.normalization || {};
  for (const [variant, base] of Object.entries(mappings)) {
    if (typeof variant !== 'string' || typeof base !== 'string' || !variant) continue;
    const folded = Array.from(normalizeWithMappings(base.toLowerCase(), mappings).toLowerCase());
    if (!folded.length || folded.some((ch) => !letters.has(ch))) continue;
    for (const ch of Array.from(variant.toLowerCase())) {
      if (ch.trim()) accepted.add(ch);
    }
  }
  return { letters, accepted };
}

/** Length in characters, counting a two-sign letter such as Armenian ու as two. */
export function wordLength(word) {
  return Array.from(word).length;
}

/**
 * @param {string} relPath repo-relative path
 * @param {string} text
 * @param {{ languages?: object[], readLanguage?: (dir: string) => object | null }} [options]
 * @returns {string[]}
 */
export function verifyWordText(relPath, text, options = {}) {
  const normalized = relPath.split(path.sep).join('/');
  const match = WORD_FILE.exec(normalized);
  if (!match) return [];
  const [, group, languageDir, fileName] = match;
  const rules = GROUP_RULES[group];
  if (!rules) return [`${normalized}: no word rules for group ${group}`];

  const language = options.readLanguage
    ? options.readLanguage(languageDir)
    : readLanguage(languageDir);
  if (!language) return [`${normalized}: no keyboard for ${languageDir}`];
  const { letters, accepted } = acceptedLetters(language);
  const menu = language.menu || languageDir;

  /** @type {string[]} */
  const errors = [];
  const exactLength = rules.exactLength ? g1Length(fileName, errors, normalized) : null;
  if (rules.exactLength && exactLength != null) {
    const allowed = lengthsFor(languageDir, options.languages);
    if (allowed && !allowed.includes(exactLength)) {
      errors.push(
        `${normalized}: length ${exactLength} is not a ${menu} length (${allowed.join(', ')})`,
      );
    }
  }

  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  lines.forEach((line, index) => {
    const parsed = parseLine(line, rules);
    if (!parsed || parsed.skip) return;
    const where = `${normalized}:${index + 1}`;
    if (parsed.error) {
      errors.push(`${where}: ${parsed.error}`);
      return;
    }
    const word = parsed.word;
    const foreign = [];
    for (const ch of Array.from(word)) {
      if (!accepted.has(ch)) foreign.push(ch);
    }
    if (foreign.length) {
      errors.push(`${where}: "${word}" uses letters that are not on the ${menu} keyboard: ${unique(foreign).join(' ')}`);
      return;
    }
    const folded = Array.from(normalizeWithMappings(word, language.normalization).toLowerCase());
    const unfolded = folded.filter((ch) => !letters.has(ch));
    if (unfolded.length) {
      errors.push(`${where}: "${word}" does not fold onto the ${menu} keyboard: ${unique(unfolded).join(' ')}`);
    }
    if (exactLength != null && wordLength(word) !== exactLength) {
      errors.push(`${where}: "${word}" is ${wordLength(word)} characters, expected ${exactLength}`);
    }
  });
  return errors;
}

function g1Length(fileName, errors, normalized) {
  const match = G1_LENGTH.exec(fileName);
  if (!match) {
    errors.push(`${normalized}: expected answers-N.txt or dictionary-N.txt`);
    return null;
  }
  return Number(match[1]);
}

function lengthsFor(languageDir, languages) {
  const code = codeForLanguageName(languageDir);
  const list = languages || loadLanguages();
  const entry = list.find((lang) => lang.code === code);
  return Array.isArray(entry?.polywordlotLengths) ? entry.polywordlotLengths : null;
}

/**
 * @param {string} line
 * @param {{ exactLength?: boolean, level?: boolean, bareWord?: boolean }} rules
 */
function parseLine(line, rules) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return { skip: true };
  if (rules.bareWord) {
    const hash = trimmed.indexOf('#');
    const body = (hash === -1 ? trimmed : trimmed.slice(0, hash)).trim();
    if (!body) return { error: 'missing the word before #' };
    const parts = body.split(/[\t ]+/);
    if (parts.length !== 1) return { error: `"${parts[0]}" has extra text after the word` };
    return { word: parts[0].toLowerCase() };
  }
  const parts = trimmed.split(/[\t ]+/);
  const word = (parts[0] || '').toLowerCase();
  if (!word) return { skip: true };
  if (rules.level && parts.length > 2) return { error: `"${word}" has extra fields` };
  if (rules.level && parts.length === 2 && !/^[1-9]\d*$/.test(parts[1])) {
    return { error: `"${word}" level "${parts[1]}" is not a positive integer` };
  }
  return { word };
}

function unique(chars) {
  return [...new Set(chars)];
}

function readLanguage(languageDir) {
  const file = path.join(ROOT, 'word-data', languageDir, 'language.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function loadLanguages() {
  const file = path.join(ROOT, 'word-data', 'languages.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** @returns {string[]} repo-relative word-list paths */
export function wordListFiles() {
  /** @type {string[]} */
  const found = [];
  const games = path.join(ROOT, 'games');
  if (!fs.existsSync(games)) return found;
  for (const group of fs.readdirSync(games)) {
    if (!/^g\d+$/.test(group)) continue;
    const languages = path.join(games, group, 'data', 'languages');
    if (!fs.existsSync(languages)) continue;
    for (const languageDir of fs.readdirSync(languages)) {
      const dir = path.join(languages, languageDir);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const fileName of fs.readdirSync(dir)) {
        if (!fileName.endsWith('.txt')) continue;
        found.push(path.join('games', group, 'data', 'languages', languageDir, fileName).split(path.sep).join('/'));
      }
    }
  }
  return found.sort();
}

function stagedWordFiles() {
  const out = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return out.split('\0').filter((file) => WORD_FILE.test(file));
}

function stagedText(relPath) {
  return execFileSync('git', ['show', `:${relPath}`], { cwd: ROOT, encoding: 'utf8' });
}

/**
 * @param {string[]} [files] repo-relative paths; omit for every word list
 * @param {{ staged?: boolean }} [options]
 */
export function verifyFiles(files, options = {}) {
  const list = files || wordListFiles();
  /** @type {string[]} */
  const errors = [];
  for (const relPath of list) {
    let text;
    if (options.staged) text = stagedText(relPath);
    else {
      const abs = path.join(ROOT, relPath);
      if (!fs.existsSync(abs)) {
        errors.push(`${relPath}: file is missing`);
        continue;
      }
      text = fs.readFileSync(abs, 'utf8');
    }
    errors.push(...verifyWordText(relPath, text));
  }
  return errors;
}

function report(errors) {
  const shown = errors.slice(0, MAX_SHOWN);
  for (const error of shown) console.error(error);
  if (errors.length > shown.length) console.error(`… and ${errors.length - shown.length} more`);
  console.error(`\n${errors.length} word ${errors.length === 1 ? 'problem' : 'problems'}`);
}

function main() {
  const args = process.argv.slice(2);
  const staged = args.includes('--staged');
  const files = args.filter((arg) => arg !== '--staged');
  const targets = staged ? stagedWordFiles() : files.length ? files : null;
  if (staged && !targets.length) return;
  const errors = verifyFiles(targets, { staged });
  if (!errors.length) return;
  report(errors);
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
