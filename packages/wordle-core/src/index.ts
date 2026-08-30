export type {
  LetterState,
  LetterEvaluation,
  Guess,
  GameState,
  DictionaryEntry,
  LanguageConfig,
} from './types';

export { evaluateGuess, isValidWord } from './gameLogic';
export { getDailyWord, getRandomWord, getWordFromSeed, formatDate } from './dailyWord';
export {
  loadNormalization,
  normalizeForLanguage,
  isWinningGuessForLanguage,
} from './characterNormalization';
export { registerInputPlugin, applyInputPlugins } from './inputPlugins';
export type { InputPluginHandler } from './inputPlugins';
export {
  getLanguageDir,
  loadWinMessage,
  loadHelpTip,
  loadLoseMessage,
  loadAbout,
  loadDictionary,
  getLanguageConfigs,
  getLanguageConfig,
  loadKeyboard,
  getKeyboardRtl,
  loadKeyboardActions,
  getNormalization,
  getInputPlugins,
  preloadAllDictionaries,
} from './languageLoader';
export type { KeyboardActions, InputPluginConfig } from './languageLoader';
export { Keyboard } from './components/Keyboard';
export { boardKnowledgeScore, boardKnowledgeTally, scoreboardYellowFactor } from './knowledgeScore';
export { getHydraDailyWords, hydraDailySeed } from './hydraWords';
export {
  BOARD_COUNT_MIN,
  BOARD_COUNT_MAX,
  DEFAULT_BOARD_COUNT,
  EXTRA_ATTEMPTS_BY_BOARD_COUNT,
  SCOREBOARD_YELLOW_CAP,
  clampBoardCount,
  extraAttemptsForBoardCount,
  maxGuessesForBoardCount,
} from './hydraConfig';
