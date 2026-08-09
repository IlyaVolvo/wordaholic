import { getNormalization } from '../data/languageLoader';

/**
 * Loads character normalization mappings for a language.
 * Normalization data is now embedded in language.json and loaded by languageLoader.
 * This function simply retrieves the cached data.
 * Must be called after loadKeyboard() has been called for this language.
 */
export async function loadNormalization(language: string): Promise<Record<string, string> | null> {
  return getNormalization(language);
}

/**
 * Normalizes characters for a given language
 * Replaces variant characters with their base equivalents according to language-specific rules
 * Uses normalization mappings from language.json
 * 
 * @param word - The word to normalize
 * @param language - Language code (e.g., 'ru', 'fr', 'de')
 * @returns Normalized word with variant characters replaced
 */
export function normalizeForLanguage(word: string, language: string): string {
  const mappings = getNormalization(language);
  
  // If no mappings exist for this language, return word as-is
  if (!mappings || Object.keys(mappings).length === 0) {
    return word;
  }
  
  // Apply all character replacements
  // Process multi-character replacements first to avoid conflicts
  let normalized = word;
  const singleCharReplacements: [string, string][] = [];
  const multiCharReplacements: [string, string][] = [];
  
  for (const [variant, base] of Object.entries(mappings)) {
    if (base.length > 1) {
      multiCharReplacements.push([variant, base]);
    } else {
      // Support grouped keys like "àáâä": "a" and regular single-char keys.
      // In both cases we normalize each variant character individually.
      for (const singleVariant of Array.from(variant)) {
        singleCharReplacements.push([singleVariant, base]);
      }
    }
  }
  
  // Apply multi-character replacements first (e.g., ß -> ss)
  for (const [variant, base] of multiCharReplacements) {
    normalized = normalized.replace(new RegExp(escapeRegex(variant), 'g'), base);
  }
  
  // Then apply single-character replacements
  for (const [variant, base] of singleCharReplacements) {
    normalized = normalized.replace(new RegExp(escapeRegex(variant), 'g'), base);
  }
  
  return normalized;
}

export function isWinningGuessForLanguage(guess: string, target: string, language: string): boolean {
  const normalizedGuess = normalizeForLanguage(guess.toLowerCase().trim(), language);
  const normalizedTarget = normalizeForLanguage(target.toLowerCase().trim(), language);
  return normalizedGuess === normalizedTarget;
}

/**
 * Escapes special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
