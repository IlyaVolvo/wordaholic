import type { DictionaryEntry } from './types';
import { getDailyWord as pickDailyWord, formatDate as formatLocalDate } from '../../../app/daily/daily-word.js';

/**
 * Gets a deterministic word for a given date from a dictionary.
 * Uses only answer words, not the full dictionary.
 */
export function getDailyWord(dictionary: DictionaryEntry, date: string = formatDate()): string {
  return pickDailyWord(dictionary, date);
}

/** Generates a random word from a dictionary (not date-based). */
export function getRandomWord(dictionary: DictionaryEntry): string {
  const words = dictionary.words;
  const index = Math.floor(Math.random() * words.length);
  return words[index];
}

/** Generates a deterministic word based on a seed value. Uses only answer words. */
export function getWordFromSeed(dictionary: DictionaryEntry, seed: number): string {
  const answerWords = dictionary.answerWords;
  const index = seed % answerWords.length;
  return answerWords[index];
}

/** Formats a date as YYYY-MM-DD using local time (not UTC). */
export function formatDate(date: Date = new Date()): string {
  return formatLocalDate(date);
}
