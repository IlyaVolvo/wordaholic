/**
 * Language-specific letter processing shared by the games.
 * Every hook has a default that changes nothing; a language overrides only what it
 * needs in its own module here (he.js). A language without a module uses the defaults.
 */
import hebrew from './he.js';

/**
 * @typedef {object} LetterPlace
 * @property {boolean} end    the letter is the last one of the word, in reading order
 * @property {string} [word]  the whole word, when known
 */

/**
 * @typedef {object} LanguageHooks
 * @property {(letter: string, place: LetterPlace) => string} formAt
 *   The letter as written at this place in a word (Hebrew: final form at the end).
 * @property {(letter: string) => string} baseLetter
 *   The letter a positional form stands for (Hebrew: ם → מ). Games draw and count base letters.
 */

/** @type {LanguageHooks} */
const DEFAULT_HOOKS = {
  formAt: (letter) => letter,
  baseLetter: (letter) => letter,
};

/** @type {Record<string, Partial<LanguageHooks>>} */
const LANGUAGES = {
  he: hebrew,
};

/**
 * @param {string} code language code, e.g. "he"
 * @returns {LanguageHooks}
 */
export function languageHooks(code) {
  return { ...DEFAULT_HOOKS, ...(LANGUAGES[String(code || '').toLowerCase()] || {}) };
}

/**
 * A word written with each letter in its place form. `word` is in reading order.
 * @param {string} word
 * @param {LanguageHooks} hooks
 */
export function spellInPlace(word, hooks) {
  const letters = Array.from(word);
  return letters.map((letter, i) => hooks.formAt(letter, { end: i === letters.length - 1, word })).join('');
}
