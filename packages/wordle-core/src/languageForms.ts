/**
 * Positional letter forms (Hebrew final letters) come from the language's own module
 * in app/i18n/languages; languages without one leave letters unchanged.
 */
import { languageHooks } from '@wordaholic/languages';

/**
 * The letter to add when `key` is typed into `currentGuess`.
 * With RTL entry the new letter goes in front, but it is still the next letter in reading order.
 */
export function typedLetter(
  key: string,
  currentGuess: string,
  wordLength: number,
  rtl: boolean,
  language: string
): string {
  const word = rtl ? key + currentGuess : currentGuess + key;
  return languageHooks(language).formAt(key, { end: currentGuess.length === wordLength - 1, word });
}

/** The letter as written in a word column; `isEndOfWord` is the last column. */
export function letterInPlace(letter: string, isEndOfWord: boolean, language: string): string {
  return languageHooks(language).formAt(letter, { end: isEndOfWord });
}
