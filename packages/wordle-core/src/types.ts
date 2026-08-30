export type LetterState = 'correct' | 'present' | 'absent' | 'typing';

export interface LetterEvaluation {
  letter: string;
  state: LetterState;
}

export interface Guess {
  word: string;
  evaluations: LetterEvaluation[];
}

export interface GameState {
  guesses: Guess[];
  currentGuess: string;
  isComplete: boolean;
  isWon: boolean;
  language: string;
  wordLength: number;
  date: string; // YYYY-MM-DD format or timestamp for random mode
  isRandomMode?: boolean; // If true, word changes each game
  wordSeed?: number; // Seed used to generate the word (for random mode)
}

export interface DictionaryEntry {
  language: string;
  wordLength: number;
  words: string[]; // All valid words (for validation)
  answerWords: string[]; // Only answer words (sorted, for daily word selection)
  answerWordsOriginal: string[]; // Answer words in original file order (by frequency)
}

export interface LanguageConfig {
  code: string;
  name: string;
  /** Optional flag emoji (e.g. "🇪🇸") for display; shown alone when closed, with name in dropdown. */
  flag?: string;
  supportedLengths: number[];
}

