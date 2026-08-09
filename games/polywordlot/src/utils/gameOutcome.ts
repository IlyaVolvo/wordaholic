import { loadKeyboard } from '../data/languageLoader';
import { isWinningGuessForLanguage } from './characterNormalization';

type GuessLike = { word: string } | string;
const MAX_GUESSES = 6;

const toGuessWords = (guesses: GuessLike[] | undefined): string[] => {
  if (!Array.isArray(guesses)) return [];
  return guesses
    .map((g) => (typeof g === 'string' ? g : g?.word))
    .filter((word): word is string => typeof word === 'string' && word.length > 0);
};

export async function deriveGameOutcome(input: {
  language: string;
  isComplete: boolean;
  targetWord: string;
  guesses: GuessLike[] | undefined;
}): Promise<{ isWon: boolean; guessesCount: number }> {
  await loadKeyboard(input.language);
  const guessWords = toGuessWords(input.guesses);
  const guessesCount = guessWords.length;

  if (!input.isComplete || guessesCount === 0) {
    return { isWon: false, guessesCount };
  }

  // A valid win must happen within the allowed attempts.
  if (guessesCount > MAX_GUESSES) {
    return { isWon: false, guessesCount };
  }

  const isWon = isWinningGuessForLanguage(
    guessWords[guessesCount - 1],
    input.targetWord,
    input.language
  );
  return { isWon, guessesCount };
}

