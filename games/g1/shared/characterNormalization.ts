import { getNormalization } from './languageLoader';
import { normalizeWithMappings } from '@wordaholic/normalize';

/**
 * Loads character normalization mappings for a language.
 * Normalization data is embedded in shared language.json and loaded by languageLoader.
 * Must be called after loadKeyboard() has been called for this language.
 */
export async function loadNormalization(language: string): Promise<Record<string, string> | null> {
  return getNormalization(language);
}

/**
 * Normalizes characters for a given language using shared language.json maps.
 */
export function normalizeForLanguage(word: string, language: string): string {
  return normalizeWithMappings(word, getNormalization(language));
}

export function isWinningGuessForLanguage(guess: string, target: string, language: string): boolean {
  const normalizedGuess = normalizeForLanguage(guess.toLowerCase().trim(), language);
  const normalizedTarget = normalizeForLanguage(target.toLowerCase().trim(), language);
  return normalizedGuess === normalizedTarget;
}
