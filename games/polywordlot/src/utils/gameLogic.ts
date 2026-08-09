import type { LetterEvaluation, DictionaryEntry } from '../types';
import { normalizeForLanguage } from './characterNormalization';

/**
 * Evaluates a guess against the target word
 */
export function evaluateGuess(guess: string, target: string, language: string = 'en'): LetterEvaluation[] {
  const evaluations: LetterEvaluation[] = [];
  
  // Normalize for Russian (ё -> е)
  const normalizedTarget = normalizeForLanguage(target, language);
  const normalizedGuess = normalizeForLanguage(guess, language);
  
  const targetChars = normalizedTarget.split('');
  const guessChars = normalizedGuess.split('');
  const originalGuessChars = guess.split(''); // Keep original for display
  const targetLetterCounts: Map<string, number> = new Map();
  const usedIndices = new Set<number>();

  // Count letters in target word (using normalized characters)
  for (const char of targetChars) {
    targetLetterCounts.set(char, (targetLetterCounts.get(char) || 0) + 1);
  }

  // First pass: mark correct letters (compare normalized, display original)
  for (let i = 0; i < guessChars.length; i++) {
    if (guessChars[i] === targetChars[i]) {
      evaluations[i] = { letter: originalGuessChars[i], state: 'correct' };
      usedIndices.add(i);
      targetLetterCounts.set(guessChars[i], (targetLetterCounts.get(guessChars[i]) || 0) - 1);
    }
  }

  // Second pass: mark present and absent letters
  for (let i = 0; i < guessChars.length; i++) {
    if (!usedIndices.has(i)) {
      const count = targetLetterCounts.get(guessChars[i]) || 0;
      if (count > 0) {
        evaluations[i] = { letter: originalGuessChars[i], state: 'present' };
        targetLetterCounts.set(guessChars[i], count - 1);
      } else {
        evaluations[i] = { letter: originalGuessChars[i], state: 'absent' };
      }
    }
  }

  return evaluations;
}

/**
 * Checks if a word is valid in the dictionary
 */
export function isValidWord(word: string, dictionary: DictionaryEntry | null): boolean {
  if (!dictionary) return false;
  const normalized = word.toLowerCase().trim();
  const normalizedForLang = normalizeForLanguage(normalized, dictionary.language);
  
  // Check if word exists in dictionary (normalize both word and dictionary entries)
  return dictionary.words.some(dictWord => {
    const normalizedDictWord = normalizeForLanguage(dictWord.toLowerCase(), dictionary.language);
    return normalizedDictWord === normalizedForLang;
  });
}

