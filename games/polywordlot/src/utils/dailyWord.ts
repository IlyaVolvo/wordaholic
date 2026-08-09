import type { DictionaryEntry } from '../types';

/**
 * Generates a deterministic seed for a given date and dictionary
 */
function generateSeed(date: string, language: string, wordLength: number): number {
  const dateStr = date.replace(/-/g, '');
  const combined = `${dateStr}-${language}-${wordLength}`;
  
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return Math.abs(hash);
}

/**
 * Gets a deterministic word for a given date from a dictionary
 * Uses only answer words, not the full dictionary
 */
export function getDailyWord(
  dictionary: DictionaryEntry,
  date: string = formatDate()
): string {
  const seed = generateSeed(date, dictionary.language, dictionary.wordLength);
  const answerWords = dictionary.answerWords;
  const index = seed % answerWords.length;
  return answerWords[index];
}

/**
 * Generates a random word from a dictionary (not date-based)
 */
export function getRandomWord(dictionary: DictionaryEntry): string {
  const words = dictionary.words;
  const index = Math.floor(Math.random() * words.length);
  return words[index];
}

/**
 * Generates a deterministic word based on a seed value
 * Uses only answer words, not the full dictionary
 */
export function getWordFromSeed(dictionary: DictionaryEntry, seed: number): string {
  const answerWords = dictionary.answerWords;
  const index = seed % answerWords.length;
  return answerWords[index];
}

/**
 * Formats a date as YYYY-MM-DD using local time (not UTC)
 */
export function formatDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

