export type {
  LetterState,
  LetterEvaluation,
  Guess,
  DictionaryEntry,
  LanguageConfig,
} from '@wordaholic/wordle-core';

export type HydraBoard = {
  target: string;
  guesses: string[];
  solved: boolean;
};

export type HydraGameState = {
  date: string;
  language: string;
  wordLength: number;
  boardCount: number;
  targets: string[];
  boardGuesses: string[][];
  currentGuess: string;
  invalidPending: boolean;
  isComplete: boolean;
  isWon: boolean;
};
