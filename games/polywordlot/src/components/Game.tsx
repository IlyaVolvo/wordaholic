import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import type { GameState, DictionaryEntry, LetterState, LanguageConfig } from '../types';
import { GameBoard } from './GameBoard';
import { Keyboard } from './Keyboard';
import { Settings } from './Settings';
import { Calendar } from './Calendar';
import { loadDictionary, loadKeyboard, getKeyboardRtl, getInputPlugins, loadWinMessage, loadLoseMessage } from '../data/languageLoader';
import { applyInputPlugins } from '../utils/inputPlugins';
import { getDailyWord, getWordFromSeed, formatDate } from '../utils/dailyWord';
import { evaluateGuess, isValidWord } from '../utils/gameLogic';
import { normalizeForLanguage, loadNormalization, isWinningGuessForLanguage } from '../utils/characterNormalization';
import { loadPreferences, savePreferences, getSelectedDate, setSelectedDate } from '../utils/preferences';
import { apiClient } from '../api/client';
import { gameCacheUtils } from '../utils/gameCache';
import { refreshGamesFromIndexedDb, STORAGE_IMPORTED_EVENT } from '../storage/platform';
import { openHelp, isHelpOpen } from '@wordaholic/help';

const MAX_GUESSES = 6;

/** Put the end-of-game message beside the board when it cannot fit below without shrinking it. */
function syncEndgameMessagePlacement(pane: HTMLElement) {
  const board = pane.querySelector<HTMLElement>('.game-board');
  const result = pane.querySelector<HTMLElement>('.game-result');
  pane.classList.remove('game-play-area--result-side');
  if (result) {
    result.style.left = '';
    result.style.top = '';
    result.style.removeProperty('--result-side-max');
  }
  if (!board || !result) return;

  const paneCs = getComputedStyle(pane);
  const innerH =
    pane.clientHeight - parseFloat(paneCs.paddingTop) - parseFloat(paneCs.paddingBottom);
  const gap = parseFloat(getComputedStyle(result).marginTop) || 0;
  if (board.offsetHeight + gap + result.offsetHeight <= innerH + 0.5) return;

  pane.classList.add('game-play-area--result-side');
  const host = (result.offsetParent as HTMLElement) || pane;
  const hostRect = host.getBoundingClientRect();
  const boardRect = board.getBoundingClientRect();
  const gapX = 12;
  const room = pane.getBoundingClientRect().right - parseFloat(paneCs.paddingRight) - boardRect.right - gapX;
  result.style.left = `${boardRect.right - hostRect.left + gapX}px`;
  result.style.top = `${(boardRect.top + boardRect.bottom) / 2 - hostRect.top}px`;
  result.style.setProperty('--result-side-max', `${Math.max(room, 176)}px`);
}

function guessWord(g: { word?: string } | string | null | undefined): string {
  return typeof g === 'string' ? g : g?.word || '';
}

function guessesWithEvaluations(
  guesses: unknown,
  target: string,
  lang: string
): Array<{ word: string; evaluations: ReturnType<typeof evaluateGuess> }> {
  if (!Array.isArray(guesses)) return [];
  return guesses.map((g) => {
    const word = guessWord(g);
    return { word, evaluations: evaluateGuess(word, target, lang) };
  });
}

interface GameProps {
  userId: number;
  onLogout?: () => void;
  view?: 'game' | 'statistics';
  onViewChange?: (view: 'game' | 'statistics', statType?: string) => void;
  onRecordPlayed?: () => void;
  historicalDate?: string | null;
  onHistoricalDateCleared?: () => void;
  onViewHistoricalGame?: (date: string) => void;
  language: string;
  wordLength: number;
  onLanguageChange: (language: string) => void;
  onWordLengthChange: (wordLength: number) => void;
  availableLanguages: LanguageConfig[];
  onShowTutorial?: () => void;
}

export const Game: React.FC<GameProps> = ({ 
  userId, 
  onLogout, 
  view = 'game', 
  onViewChange, 
  onRecordPlayed,
  historicalDate, 
  onHistoricalDateCleared: _onHistoricalDateCleared, 
  onViewHistoricalGame: _onViewHistoricalGame,
  language,
  wordLength,
  onLanguageChange,
  onWordLengthChange,
  availableLanguages,
  onShowTutorial
}) => {
  const [dictionary, setDictionary] = useState<DictionaryEntry | null>(null);
  const [targetWord, setTargetWord] = useState<string>('');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [letterStates, setLetterStates] = useState<Map<string, LetterState>>(new Map());
  const [randomMode, setRandomMode] = useState<boolean>(false);
  const initializedRef = useRef<boolean>(false);
  /** Ref set when dictionary is loaded so load effect only runs for current language/wordLength */
  const dictionaryForRef = useRef<{ language: string; wordLength: number } | null>(null);
  const playAreaRef = useRef<HTMLDivElement>(null);
  const [selectedPlayDate, setSelectedPlayDate] = useState<string>('');
  const [keyboardRtl, setKeyboardRtl] = useState<boolean>(false);
  const [shakeRowIndex, setShakeRowIndex] = useState<number | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showWordIndexPopup, setShowWordIndexPopup] = useState(false);
  const [wordIndexInput, setWordIndexInput] = useState('');
  const wordIndexGameStartedRef = useRef(false);
  const [calendarGames, setCalendarGames] = useState<any[]>([]);
  const [calendarBlinkingDates, setCalendarBlinkingDates] = useState<Set<string>>(new Set());
  const [winMessage, setWinMessage] = useState<string>('Congratulations! You won!');
  const [loseMessage, setLoseMessage] = useState<string>('Answer was: {word}');
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const today = formatDate();
    const [year, month] = today.split('-').map(Number);
    return new Date(year, month - 1, 1);
  });
  const calendarMonthRef = useRef<Date>(calendarMonth);
  
  // Keep ref in sync with state
  useEffect(() => {
    calendarMonthRef.current = calendarMonth;
  }, [calendarMonth]);
  
  // Swipe gesture tracking for date navigation (entire screen)
  const touchStartRef = useRef<number | null>(null);
  const touchEndRef = useRef<number | null>(null);
  const swipeStartDateRef = useRef<string | null>(null); // Capture date at swipe start
  const minSwipeDistance = 100;

  // Load preferences on mount - default to Daily mode (not Training)
  useEffect(() => {
    const prefs = loadPreferences();
    // Default to Daily (not Training) if not set
    setRandomMode(prefs.randomMode === true);
    // Initialize selected date - will be set properly when language/wordLength are available
    // in the changeSettings useEffect
  }, []);

  const updateLetterStates = useCallback((state: GameState) => {
    const states = new Map<string, LetterState>();
    const lang = state.language;
    for (const guess of state.guesses) {
      for (const eval_ of guess.evaluations) {
        // Use normalized (canonical) form for key so final/non-final variants share state (e.g. Hebrew ם/מ)
        const canonicalKey = normalizeForLanguage(eval_.letter, lang);
        const currentState = states.get(canonicalKey);
        // Priority: correct > present > absent
        if (!currentState ||
            (currentState === 'absent' && eval_.state !== 'absent') ||
            (currentState === 'present' && eval_.state === 'correct')) {
          states.set(canonicalKey, eval_.state);
        }
      }
    }
    setLetterStates(states);
  }, []);

  /** Apply a loaded/restored game (has guesses); updates board, target, and keyboard letter states. */
  const applyLoadedGame = useCallback((state: GameState, target: string) => {
    setGameState(state);
    setTargetWord(target);
    updateLetterStates(state);
  }, [updateLetterStates]);

  /** Apply a new or reset game (no guesses yet); clears keyboard letter states. */
  const applyNewOrResetGame = useCallback((state: GameState, target: string) => {
    setGameState(state);
    setTargetWord(target);
    setLetterStates(new Map());
  }, []);

  /** Clear game display (no game for this day, or leaving Training). */
  const clearGameDisplay = useCallback(() => {
    setGameState(null);
    setTargetWord('');
    setLetterStates(new Map());
  }, []);

  // Handle historicalDate prop (legacy, might be removed)
  useEffect(() => {
    if (historicalDate && (!gameState || gameState.isComplete)) {
      setSelectedPlayDate(historicalDate);
    }
  }, [historicalDate, gameState]);

  // Load dictionary on mount (keep dictionaryForRef in sync so resolver runs for current lang/count)
  useEffect(() => {
    const loadDict = async () => {
      try {
        const dict = await loadDictionary(language, wordLength);
        if (dict) {
          setDictionary(dict);
          dictionaryForRef.current = { language, wordLength };
        }
      } catch (err) {
        console.error('Failed to load dictionary:', err);
      }
    };
    loadDict();
  }, [language, wordLength]);

  // Load RTL once per language from language.json (static for the session)
  useEffect(() => {
    let cancelled = false;
    getKeyboardRtl(language).then((rtl) => {
      if (!cancelled) setKeyboardRtl(rtl);
    });
    return () => { cancelled = true; };
  }, [language]);

  // Load win message for the current language
  useEffect(() => {
    let cancelled = false;
    loadWinMessage(language).then((msg) => {
      if (!cancelled) setWinMessage(msg || 'Congratulations! You won!');
    });
    return () => { cancelled = true; };
  }, [language]);

  // Load lose message template for the current language
  useEffect(() => {
    let cancelled = false;
    loadLoseMessage(language, '{word}').then((msg) => {
      if (!cancelled) setLoseMessage(msg || 'Answer was: {word}');
    });
    return () => { cancelled = true; };
  }, [language]);

  useLayoutEffect(() => {
    const pane = playAreaRef.current;
    if (!pane) return;
    const sync = () => syncEndgameMessagePlacement(pane);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(pane);
    const board = pane.querySelector('.game-board');
    if (board) ro.observe(board);
    return () => ro.disconnect();
  }, [gameState?.isComplete, gameState?.isWon, winMessage, loseMessage, targetWord, wordLength]);

  // Initialize component - just load dictionary and normalization, don't create game
  useEffect(() => {
    // Re-mount (e.g. React Strict Mode): ref persists but state was reset → loading would stay true
    if (initializedRef.current) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const initialize = async () => {
      setLoading(true);
      setError(null);

      try {
        await refreshGamesFromIndexedDb();
        gameCacheUtils.clearAllCache();
        const [dict] = await Promise.all([
          loadDictionary(language, wordLength),
          loadNormalization(language),
          loadKeyboard(language),
        ]);
        if (cancelled) return;
        if (!dict) {
          setError(`Failed to load dictionary for ${language}-${wordLength}`);
          setLoading(false);
          return;
        }
        setDictionary(dict);
        dictionaryForRef.current = { language, wordLength };
        initializedRef.current = true;
        const today = formatDate();
        setSelectedPlayDate(today);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to initialize');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    initialize();
    return () => { cancelled = true; };
  }, [userId, language, wordLength]);

  useEffect(() => {
    const onImported = () => {
      void (async () => {
        await refreshGamesFromIndexedDb();
        gameCacheUtils.clearAllCache();
      })();
    };
    window.addEventListener(STORAGE_IMPORTED_EVENT, onImported);
    return () => window.removeEventListener(STORAGE_IMPORTED_EVENT, onImported);
  }, []);

  // Store selected date per (language, wordLength) combination
  const loadStoredDate = useCallback((lang: string, len: number): string | null => {
    return getSelectedDate(lang, len);
  }, []);

  const saveStoredDate = useCallback((lang: string, len: number, date: string) => {
    setSelectedDate(lang, len, date);
  }, []);

  // Handle language or word length change: reload dictionary and set selected date; game state is set by load effect
  useEffect(() => {
    if (!initializedRef.current || loading) return;

    const changeSettings = async () => {
      try {
        const [dict] = await Promise.all([
          loadDictionary(language, wordLength),
          loadNormalization(language),
          loadKeyboard(language),
        ]);
        if (dict) {
          setDictionary(dict);
          dictionaryForRef.current = { language, wordLength };
        }
        const today = formatDate();
        const storedDate = loadStoredDate(language, wordLength);
        let dateToUse = today;
        if (storedDate) {
          try {
            const response = await apiClient.getCurrentGame({
              language,
              wordLength,
              gameDate: storedDate,
              isRandomMode: false,
            });
            // Use last played date only if game exists and is not finished
            if (response.game && !response.game.is_complete) {
              dateToUse = storedDate;
            }
          } catch {
            // API error or not logged in: default to today
          }
        }
        setSelectedPlayDate(dateToUse);
        saveStoredDate(language, wordLength, dateToUse);
      } catch (err) {
        console.error('Failed to load dictionary:', err);
      }
    };

    changeSettings();
  }, [language, wordLength, initializedRef.current, loading, loadStoredDate, saveStoredDate]);

  const saveGameToApi = useCallback(async (state: GameState) => {
    if (state.isRandomMode) return;
    if (!dictionary || !targetWord) return; // Save on Enter: create or update daily record
    try {
      const response = await apiClient.saveGame({
        language: state.language,
        wordLength: state.wordLength,
        targetWord,
        gameDate: state.date,
        isRandomMode: false,
        wordSeed: state.wordSeed,
        guesses: state.guesses.map((g) => g.word),
        isComplete: state.isComplete,
        isWon: state.isWon,
      });
      // Single source: update cache so resolver sees same data on next run
      gameCacheUtils.updateCachedGame(state.language, state.wordLength, state.date, {
        id: response.gameId,
        language: state.language,
        word_length: state.wordLength,
        target_word: targetWord,
        game_date: state.date,
        is_random_mode: 0,
        word_seed: null,
        is_complete: state.isComplete ? 1 : 0,
        guesses: state.guesses.map((g) => g.word),
        isWon: state.isWon,
        guessesCount: state.guesses.length,
        created_at: new Date().toISOString(),
        completed_at: state.isComplete ? new Date().toISOString() : null,
      });
    } catch (error) {
      console.error('Failed to save game to API:', error);
    }
  }, [dictionary, targetWord]);

  /**
   * Single source for "current game state" for the selected day/language/count.
   * Called when game setting (language, letter count, or mode) or selected date changes.
   * When setting changes, partial state is discarded; the new setting shows the last state stored in the DB.
   */
  const resolveStateForSelectedDay = useCallback(async () => {
    if (randomMode) {
      // Don't clear if we just started a game via word index selector
      if (wordIndexGameStartedRef.current) {
        wordIndexGameStartedRef.current = false;
        return;
      }
      clearGameDisplay();
      return;
    }
    if (!dictionary || loading) return;
    // Only resolve when dictionary is for current (language, wordLength). Prevents using wrong dictionary
    // (e.g. still Russian after switching to English) and wrongly wiping DB on target mismatch.
    if (dictionaryForRef.current?.language !== language || dictionaryForRef.current?.wordLength !== wordLength) return;

    const playDate = selectedPlayDate || formatDate();
    const dateRange = gameCacheUtils.getDefaultDateRange();

    // 1) Ensure 30-day cache for this language/wordLength
    if (!gameCacheUtils.hasValidCache(language, wordLength, dateRange)) {
      try {
        const response = await apiClient.getBulkGames({
          language,
          wordLength,
          startDate: dateRange.start,
          endDate: dateRange.end,
        });
        const cachedGames: Record<string, any> = {};
        Object.entries(response.games || {}).forEach(([date, game]: [string, any]) => {
          cachedGames[date] = {
            id: game.id,
            language: game.language,
            word_length: game.word_length,
            target_word: game.target_word,
            game_date: game.game_date,
            is_random_mode: game.is_random_mode,
            word_seed: game.word_seed,
            is_complete: game.is_complete,
            guesses: game.guesses || [],
            isWon: game.isWon,
            guessesCount: game.guessesCount || 0,
            created_at: game.created_at,
            completed_at: game.completed_at,
          };
        });
        gameCacheUtils.setCachedGames(language, wordLength, cachedGames, dateRange);
      } catch {
        // Cache optional; continue to load single date from API
      }
    }

    // 2) Resolve state for selected day from cache or API
    const cachedGame = gameCacheUtils.getCachedGame(language, wordLength, playDate);
    if (cachedGame) {
      const target = cachedGame.target_word;
      const gameDate = cachedGame.game_date;
      const effectiveDate = gameDate || playDate;
      const expectedTarget = getDailyWord(dictionary, effectiveDate);
      if (cachedGame.is_complete !== 1 && target !== expectedTarget) {
        // Target changed - fall through to API
      } else {
        const guessesWithEvals = guessesWithEvaluations(cachedGame.guesses, target, language);
        const state: GameState = {
          guesses: guessesWithEvals,
          currentGuess: '',
          isComplete: cachedGame.is_complete === 1,
          isWon: cachedGame.isWon,
          language: cachedGame.language,
          wordLength: cachedGame.word_length,
          date: gameDate,
          isRandomMode: false,
          wordSeed: undefined,
        };
        applyLoadedGame(state, target);
        return;
      }
    }

    try {
      const currentResponse = await apiClient.getCurrentGame({
        language,
        wordLength,
        gameDate: playDate,
        isRandomMode: false,
      });
      if (currentResponse.game && currentResponse.game.is_complete !== 1) {
        const target = currentResponse.game.target_word;
        const gameDate = currentResponse.game.game_date;
        const effectiveDate = gameDate || playDate;
        const expectedTarget = getDailyWord(dictionary, effectiveDate);
        if (target !== expectedTarget) {
          const resetState: GameState = {
            guesses: [],
            currentGuess: '',
            isComplete: false,
            isWon: false,
            language: currentResponse.game.language,
            wordLength: currentResponse.game.word_length,
            date: effectiveDate,
            isRandomMode: false,
            wordSeed: undefined,
          };
          applyNewOrResetGame(resetState, expectedTarget);
          await apiClient.saveGame({
            language,
            wordLength,
            targetWord: expectedTarget,
            gameDate: effectiveDate,
            isRandomMode: false,
            guesses: [],
            isComplete: false,
            isWon: false,
          });
          gameCacheUtils.updateCachedGame(language, wordLength, effectiveDate, {
            id: currentResponse.game.id || 0,
            language: currentResponse.game.language,
            word_length: currentResponse.game.word_length,
            target_word: expectedTarget,
            game_date: effectiveDate,
            is_random_mode: 0,
            word_seed: null,
            is_complete: 0,
            guesses: [],
            isWon: false,
            guessesCount: 0,
            created_at: new Date().toISOString(),
            completed_at: null,
          });
          return;
        }
        const isValidDate = selectedPlayDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedPlayDate);
        if (gameDate && !isValidDate) setSelectedPlayDate(gameDate);
        const guessesWithEvals = guessesWithEvaluations(currentResponse.game.guesses, target, language);
        const currentGame: GameState = {
          guesses: guessesWithEvals,
          currentGuess: '',
          isComplete: false,
          isWon: false,
          language: currentResponse.game.language,
          wordLength: currentResponse.game.word_length,
          date: gameDate,
          isRandomMode: false,
          wordSeed: undefined,
        };
        applyLoadedGame(currentGame, target);
        gameCacheUtils.updateCachedGame(language, wordLength, gameDate, {
          id: currentResponse.game.id,
          language: currentResponse.game.language,
          word_length: currentResponse.game.word_length,
          target_word: target,
          game_date: gameDate,
          is_random_mode: 0,
          word_seed: null,
          is_complete: 0,
          guesses: currentResponse.game.guesses || [],
          isWon: false,
          guessesCount: (currentResponse.game.guesses || []).length,
          created_at: (currentResponse.game as any).created_at || new Date().toISOString(),
          completed_at: null,
        });
        return;
      }

      const completedResponse = await apiClient.getCompletedGame({
        language,
        wordLength,
        gameDate: playDate,
        isRandomMode: false,
      });
      if (completedResponse.game) {
        const target = completedResponse.game.target_word;
        const guessesWithEvals = guessesWithEvaluations(completedResponse.game.guesses, target, language);
        const completedGame: GameState = {
          guesses: guessesWithEvals,
          currentGuess: '',
          isComplete: completedResponse.game.is_complete === 1,
          isWon: completedResponse.game.isWon,
          language: completedResponse.game.language,
          wordLength: completedResponse.game.word_length,
          date: completedResponse.game.game_date,
          isRandomMode: false,
          wordSeed: undefined,
        };
        applyLoadedGame(completedGame, target);
        gameCacheUtils.updateCachedGame(language, wordLength, completedResponse.game.game_date, {
          id: completedResponse.game.id,
          language: completedResponse.game.language,
          word_length: completedResponse.game.word_length,
          target_word: target,
          game_date: completedResponse.game.game_date,
          is_random_mode: 0,
          word_seed: null,
          is_complete: 1,
          guesses: completedResponse.game.guesses || [],
          isWon: completedResponse.game.isWon,
          guessesCount: (completedResponse.game.guesses || []).length,
          created_at: (completedResponse.game as any).created_at || new Date().toISOString(),
          completed_at: (completedResponse.game as any).completed_at || new Date().toISOString(),
        });
        return;
      }

      clearGameDisplay();
    } catch (err) {
      console.error('Failed to load game:', err);
      clearGameDisplay();
    }
  }, [language, wordLength, selectedPlayDate, randomMode, dictionary, loading, applyLoadedGame, applyNewOrResetGame, clearGameDisplay]);

  /** Start a training game with a specific word index (modulo answer count).
   *  Switches to Practice mode automatically if not already in it. */
  const handleStartGameWithIndex = useCallback((index: number) => {
    if (!dictionary) return;

    // Switch to Practice mode if needed
    if (!randomMode) {
      const prefs = loadPreferences();
      prefs.randomMode = true;
      savePreferences(prefs);
      setRandomMode(true);
      setSelectedPlayDate('');
    }

    const answers = dictionary.answerWordsOriginal;
    const answerCount = answers.length;
    const effectiveIndex = ((index % answerCount) + answerCount) % answerCount; // handle negatives
    const target = answers[effectiveIndex];
    
    const newState: GameState = {
      guesses: [],
      currentGuess: '',
      isComplete: false,
      isWon: false,
      language,
      wordLength,
      date: Date.now().toString(),
      isRandomMode: true,
      wordSeed: effectiveIndex,
    };

    wordIndexGameStartedRef.current = true;
    applyNewOrResetGame(newState, target);
  }, [dictionary, randomMode, language, wordLength, applyNewOrResetGame]);

  /** Start game; optionally pass first key so it's applied immediately. Returns true if first key was applied. */
  const handleStartGame = useCallback(async (optionalFirstKey?: string): Promise<boolean> => {
    if (!dictionary) return false;
    const playDate = selectedPlayDate || formatDate();
    let target: string;
    let wordSeed: number | undefined;

    try {
      if (randomMode) {
        // Training mode: always start new game (apply first key so no setTimeout race)
        wordSeed = Date.now();
        target = getWordFromSeed(dictionary, wordSeed);
        
        const newState: GameState = {
          guesses: [],
          currentGuess: optionalFirstKey ?? '',
          isComplete: false,
          isWon: false,
          language,
          wordLength,
          date: Date.now().toString(),
          isRandomMode: true,
          wordSeed: wordSeed,
        };

        applyNewOrResetGame(newState, target);

        // Don't save Training mode games to DB
        return !!optionalFirstKey;
      } else {
        // Daily mode: check for existing game first
        const currentResponse = await apiClient.getCurrentGame({
          language,
          wordLength,
          gameDate: playDate,
          isRandomMode: false,
        });
        if (currentResponse.game && currentResponse.game.is_complete !== 1) {
          // Found incomplete game - continue playing it (unless daily answer changed)
          const target = currentResponse.game.target_word;
          const gameDate = currentResponse.game.game_date;
          const effectiveDate = gameDate || playDate;
          const expectedTarget = getDailyWord(dictionary, effectiveDate);
          if (target !== expectedTarget) {
            // The dictionary has been changed, we wipe out the started game. That should be rare!
            const resetState: GameState = {
              guesses: [],
              currentGuess: optionalFirstKey ?? '',
              isComplete: false,
              isWon: false,
              language: currentResponse.game.language,
              wordLength: currentResponse.game.word_length,
              date: effectiveDate,
              isRandomMode: false,
              wordSeed: undefined,
            };
            applyNewOrResetGame(resetState, expectedTarget);
            await apiClient.saveGame({
              language,
              wordLength,
              targetWord: expectedTarget,
              gameDate: effectiveDate,
              isRandomMode: false,
              guesses: [],
              isComplete: false,
              isWon: false,
            });
            return !!optionalFirstKey;
          }
          // Only sync selectedPlayDate if it's empty or invalid - don't override user-initiated date changes
          const isValidDate = selectedPlayDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedPlayDate);
          if (gameDate && !isValidDate) {
            setSelectedPlayDate(gameDate);
          }
          const guessesWithEvals = guessesWithEvaluations(currentResponse.game.guesses, target, language);
          const currentGame: GameState = {
            guesses: guessesWithEvals,
            currentGuess: '',
            isComplete: false,
            isWon: false,
            language: currentResponse.game.language,
            wordLength: currentResponse.game.word_length,
            date: gameDate,
            isRandomMode: false,
            wordSeed: undefined,
          };
          applyLoadedGame(currentGame, target);
          return false; // key not applied, caller will setTimeout to add it
        }

        // Check for completed game
        const completedResponse = await apiClient.getCompletedGame({
          language,
          wordLength,
          gameDate: playDate,
          isRandomMode: false,
        });
        if (completedResponse.game) {
          // Restore the completed game
          const target = completedResponse.game.target_word;
          const guessesWithEvals = guessesWithEvaluations(completedResponse.game.guesses, target, language);
          const completedGame: GameState = {
            guesses: guessesWithEvals,
            currentGuess: '',
            isComplete: completedResponse.game.is_complete === 1,
            isWon: completedResponse.game.isWon,
            language: completedResponse.game.language,
            wordLength: completedResponse.game.word_length,
            date: completedResponse.game.game_date,
            isRandomMode: false,
            wordSeed: undefined,
          };
          applyLoadedGame(completedGame, target);
          return false;
        }

        // No existing game, start a new one (DB record created on first word submitted); apply first key
        target = getDailyWord(dictionary, playDate);
        const newState: GameState = {
          guesses: [],
          currentGuess: optionalFirstKey ?? '',
          isComplete: false,
          isWon: false,
          language,
          wordLength,
          date: playDate,
          isRandomMode: false,
          wordSeed: undefined,
        };

        applyNewOrResetGame(newState, target);
        return !!optionalFirstKey;
      }
    } catch (err) {
      console.error('Failed to start game:', err);
      setError('Failed to start game');
      return false;
    }
  }, [dictionary, language, wordLength, randomMode, selectedPlayDate, applyLoadedGame, applyNewOrResetGame]);

  // Load games for calendar when it opens; detect and wipe stale incomplete games
  useEffect(() => {
    if (showCalendar && !randomMode) {
      const loadGames = async () => {
        try {
          const response = await apiClient.getHistory(language, wordLength, 10000);
          // Filter to only daily games (non-random mode)
          const dailyGames = response.games.filter((game: any) => !game.isRandomMode);

          const staleDates = new Set<string>();
          if (dictionary) {
            for (const game of dailyGames) {
              const gameDate = game.game_date || game.gameDate;
              if (!game.isComplete && game.guesses?.length > 0 && gameDate) {
                const expectedTarget = getDailyWord(dictionary, gameDate);
                if (game.targetWord !== expectedTarget) {
                  staleDates.add(gameDate);
                }
              }
            }
          }
          setCalendarGames(dailyGames);

          const monthKey = (year: number, monthIndex: number) => `${year}-${monthIndex}`;
          const viewing = calendarMonthRef.current;
          const viewingKey = monthKey(viewing.getFullYear(), viewing.getMonth());
          const gameDates = dailyGames
            .map((game: { game_date?: string; gameDate?: string }) => {
              const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(game.game_date || game.gameDate || '').trim());
              return match ? match[1] : '';
            })
            .filter(Boolean)
            .sort();
          const viewingHasGames = gameDates.some((date) => {
            const [year, month] = date.split('-').map(Number);
            return monthKey(year, month - 1) === viewingKey;
          });
          if (!viewingHasGames && gameDates.length) {
            const latest = gameDates[gameDates.length - 1];
            const [year, month] = latest.split('-').map(Number);
            setCalendarMonth(new Date(year, month - 1, 1));
          }

          if (staleDates.size > 0) {
            setCalendarBlinkingDates(staleDates);

            const wipePromises = dailyGames
              .filter((g: any) => staleDates.has(g.game_date || g.gameDate))
              .map(async (game: any) => {
                const gameDate = game.game_date || game.gameDate;
                const expectedTarget = dictionary ? getDailyWord(dictionary, gameDate) : game.targetWord;
                await apiClient.saveGame({
                  language,
                  wordLength,
                  targetWord: expectedTarget,
                  gameDate,
                  isRandomMode: false,
                  guesses: [],
                  isComplete: false,
                  isWon: false,
                });
                gameCacheUtils.updateCachedGame(language, wordLength, gameDate, {
                  ...game,
                  target_word: expectedTarget,
                  guesses: [],
                  is_complete: 0,
                  isWon: false,
                  guessesCount: 0,
                  completed_at: null,
                });
              });
            Promise.all(wipePromises).catch(err => console.error('Failed to wipe stale games:', err));

            setTimeout(() => {
              setCalendarGames(prev => prev.map(g => {
                const gd = g.game_date || g.gameDate;
                if (staleDates.has(gd)) {
                  return { ...g, guesses: [], isComplete: false, isWon: false };
                }
                return g;
              }));
              setCalendarBlinkingDates(new Set());
            }, 2000);
          }
        } catch (err) {
          console.error('Failed to load games for calendar:', err);
        }
      };
      loadGames();
    }
  }, [showCalendar, language, wordLength, randomMode, dictionary]);

  // Update calendar month when selectedPlayDate changes
  useEffect(() => {
    if (selectedPlayDate) {
      const [year, month] = selectedPlayDate.split('-').map(Number);
      const newMonth = new Date(year, month - 1, 1);
      // Only update if the month actually changed to avoid unnecessary re-renders
      const currentMonth = calendarMonthRef.current;
      if (currentMonth.getFullYear() !== newMonth.getFullYear() || 
          currentMonth.getMonth() !== newMonth.getMonth()) {
        setCalendarMonth(newMonth);
      }
    }
  }, [selectedPlayDate]);


  // Auto-start game when first letter is typed (instead of Play button)
  const handleKeyPress = useCallback(async (key: string) => {
    const normalizedKey = key.toLowerCase();
    const needStart = dictionary && (!gameState || (randomMode && gameState?.isComplete));
    const currentGuess = needStart ? (gameState?.currentGuess ?? '') : (gameState?.currentGuess ?? '');
    const plugins = getInputPlugins(language);
    const transformedKey = plugins.length > 0
      ? applyInputPlugins(normalizedKey, currentGuess, wordLength, keyboardRtl, plugins)
      : normalizedKey;

    if (needStart) {
      const keyApplied = await handleStartGame(transformedKey);
      if (!keyApplied) {
        setTimeout(() => {
          setGameState((currentState) => {
            if (currentState && !currentState.isComplete && currentState.currentGuess.length < wordLength) {
              const next = keyboardRtl ? transformedKey + currentState.currentGuess : currentState.currentGuess + transformedKey;
              return { ...currentState, currentGuess: next };
            }
            return currentState;
          });
        }, 0);
      }
      return;
    }

    if (!gameState || gameState.isComplete || !dictionary) return;

    if (gameState.currentGuess.length < wordLength) {
      const newGuess = keyboardRtl ? transformedKey + gameState.currentGuess : gameState.currentGuess + transformedKey;
      setGameState({ ...gameState, currentGuess: newGuess });
    }
  }, [gameState, wordLength, dictionary, language, randomMode, keyboardRtl, handleStartGame]);

  const handleEnter = useCallback(() => {
    if (!gameState || gameState.isComplete || !dictionary) return;

    // RTL: word to check = letters from highest to lowest index (reverse of typing order)
    const rawGuess = keyboardRtl ? [...gameState.currentGuess].reverse().join('') : gameState.currentGuess;
    const guess = rawGuess.toLowerCase().trim();
    
    if (guess.length !== wordLength) {
      // Show error - word not long enough
      return;
    }

    if (!isValidWord(guess, dictionary)) {
      // Trigger shake animation on the current row
      const currentRowIndex = gameState.guesses.length;
      setShakeRowIndex(currentRowIndex);
      // Clear shake after animation completes (600ms)
      setTimeout(() => {
        setShakeRowIndex(null);
      }, 600);
      return;
    }

    // Directional rule: target is normalized; guess is compared as entered.
    const isWon = isWinningGuessForLanguage(guess, targetWord, language);
    // On normalized win, persist/display the canonical target form as the final guess.
    const committedGuess = isWon ? targetWord : guess;
    const evaluations = evaluateGuess(committedGuess, targetWord, language);
    const newGuesses = [...gameState.guesses, { word: committedGuess, evaluations }];
    const isComplete = isWon || newGuesses.length >= MAX_GUESSES;

    const updatedState: GameState = {
      ...gameState,
      guesses: newGuesses,
      currentGuess: '',
      isComplete,
      isWon,
    };

    setGameState(updatedState);
    saveGameToApi(updatedState);
    updateLetterStates(updatedState);
    onRecordPlayed?.();
  }, [gameState, dictionary, wordLength, targetWord, language, keyboardRtl, saveGameToApi, updateLetterStates, onRecordPlayed]);

  const handleBackspace = useCallback(() => {
    if (!gameState || gameState.isComplete) return;

    if (gameState.currentGuess.length > 0) {
      const newGuess = keyboardRtl ? gameState.currentGuess.slice(1) : gameState.currentGuess.slice(0, -1);
      setGameState({ ...gameState, currentGuess: newGuess });
    }
  }, [gameState, keyboardRtl]);

  const handleLanguageChange = async (newLanguage: string) => {
    const langConfig = availableLanguages.find(l => l.code === newLanguage);
    const newWordLength = (langConfig && !langConfig.supportedLengths.includes(wordLength))
      ? (langConfig.supportedLengths[0] || 5)
      : wordLength;
    const prefs = loadPreferences();
    prefs.language = newLanguage;
    prefs.wordLength = newWordLength;
    savePreferences(prefs);
    if (newWordLength !== wordLength) {
      onWordLengthChange(newWordLength);
    }
    onLanguageChange(newLanguage);
  };

  const handleWordLengthChange = async (newLength: number) => {
    const prefs = loadPreferences();
    prefs.wordLength = newLength;
    savePreferences(prefs);
    onWordLengthChange(newLength);
  };

  // Single effect: whenever settings or selected date change, resolve state from one source (cache/API or Training → null)
  useEffect(() => {
    resolveStateForSelectedDay();
  }, [resolveStateForSelectedDay]);

  // Handle date change
  const handleDateChange = useCallback((date: string) => {
    setSelectedPlayDate(date);
    saveStoredDate(language, wordLength, date);
  }, [language, wordLength, saveStoredDate]);
  
  // Swipe gesture handlers for date navigation
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    // Only enable swipe for Daily mode (not Training)
    if (randomMode || showCalendar || view === 'statistics') return;
    
    // Don't trigger swipe if starting on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button') || 
        target.closest('select') || 
        target.closest('input') ||
        target.closest('.language-selector-overlay') ||
        target.closest('.game-modal-overlay')) {
      return;
    }
    
    // Capture the current date at swipe start to prevent mid-swipe state changes
    // Only use today as fallback if selectedPlayDate is empty or invalid
    // Check if selectedPlayDate is a valid date string (YYYY-MM-DD format)
    const today = formatDate();
    const isValidDate = selectedPlayDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedPlayDate);
    swipeStartDateRef.current = isValidDate ? selectedPlayDate : today;
    touchStartRef.current = e.targetTouches[0].clientX;
    touchEndRef.current = null;
  }, [randomMode, selectedPlayDate, showCalendar, view]);
  
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (randomMode || !touchStartRef.current) return;
    touchEndRef.current = e.targetTouches[0].clientX;
  }, [randomMode]);
  
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (randomMode || !touchStartRef.current || !touchEndRef.current || !swipeStartDateRef.current) {
      touchStartRef.current = null;
      touchEndRef.current = null;
      swipeStartDateRef.current = null;
      return;
    }
    
    // Prevent swiping to another day if the current game is not complete
    // Allow navigation if: no game state exists, or game is complete
    if (gameState && !gameState.isComplete) {
      // Game is in progress, don't allow navigation
      touchStartRef.current = null;
      touchEndRef.current = null;
      swipeStartDateRef.current = null;
      return;
    }
    
    const start = touchStartRef.current;
    const end = touchEndRef.current;
    const distance = start - end;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    // Use the date captured at swipe start, not current state
    const currentDate = swipeStartDateRef.current;
    const today = formatDate();
    const isToday = currentDate === today;
    
    // Helper to add/subtract days from a date string
    const addDays = (dateStr: string, days: number): string => {
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        // Invalid date format, return today minus days for left swipe, today for right
        const todayDate = new Date();
        todayDate.setDate(todayDate.getDate() + days);
        return formatDate(todayDate);
      }
      const [year, month, day] = dateStr.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      date.setDate(date.getDate() + days);
      return formatDate(date);
    };
    
    if (isRightSwipe) {
      // Right swipe = previous date (chronologically earlier)
      e.preventDefault();
      e.stopPropagation();
      const prevDate = addDays(currentDate, -1);
      handleDateChange(prevDate);
    } else if (isLeftSwipe && !isToday) {
      // Left swipe = next date (chronologically later, but disabled if today)
      e.preventDefault();
      e.stopPropagation();
      const nextDate = addDays(currentDate, 1);
      if (nextDate <= today) {
        handleDateChange(nextDate);
      }
    }
    
    // Reset touch state
    touchStartRef.current = null;
    touchEndRef.current = null;
    swipeStartDateRef.current = null;
  }, [randomMode, gameState, handleDateChange]);

  const handleRandomModeChange = useCallback((newRandomMode: boolean) => {
    const prefs = loadPreferences();
    prefs.randomMode = newRandomMode;
    savePreferences(prefs);
    setRandomMode(newRandomMode);
    if (!newRandomMode) {
      setSelectedPlayDate(formatDate());
    } else {
      setSelectedPlayDate('');
      clearGameDisplay();
    }
  }, [clearGameDisplay]);

  const handleRestartPractice = useCallback(() => {
    if (!dictionary || !randomMode) return;
    const wordSeed = Date.now();
    const target = getWordFromSeed(dictionary, wordSeed);
    const newState: GameState = {
      guesses: [],
      currentGuess: '',
      isComplete: false,
      isWon: false,
      language,
      wordLength,
      date: Date.now().toString(),
      isRandomMode: true,
      wordSeed,
    };
    applyNewOrResetGame(newState, target);
  }, [dictionary, randomMode, language, wordLength, applyNewOrResetGame]);

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Ctrl+Shift+G (or Cmd+Shift+G): open word index popup — available at any time when dictionary is loaded
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        if (dictionary) {
          setWordIndexInput('');
          setShowWordIndexPopup(true);
        }
        return;
      }

      if (showCalendar && e.key === 'Escape') {
        e.preventDefault();
        setShowCalendar(false);
        return;
      }

      // Don't process game keys when a popup is open
      if (showWordIndexPopup || showCalendar || view === 'statistics' || isHelpOpen()) return;

      if (loading) return;

      // If no game or (Training + completed game) and it's a letter, start the game first (same as handleKeyPress)
      const needStart = dictionary && (!gameState || (randomMode && gameState?.isComplete));
      if (needStart && e.key.length === 1 && /[a-zA-Zа-яА-ЯёЁ\u0590-\u05FF]/.test(e.key)) {
        const normalizedKey = e.key.toLowerCase();
        const currentGuess = gameState?.currentGuess ?? '';
        const plugins = getInputPlugins(language);
        const transformedKey = plugins.length > 0
          ? applyInputPlugins(normalizedKey, currentGuess, wordLength, keyboardRtl, plugins)
          : normalizedKey;
        const keyApplied = await handleStartGame(transformedKey);
        if (!keyApplied) {
          setTimeout(() => {
            setGameState((currentState) => {
              if (currentState && !currentState.isComplete && currentState.currentGuess.length < wordLength) {
                const next = keyboardRtl ? transformedKey + currentState.currentGuess : currentState.currentGuess + transformedKey;
                return { ...currentState, currentGuess: next };
              }
              return currentState;
            });
          }, 0);
        }
        return;
      }

      if (!gameState || gameState.isComplete) return;

      if (e.key === 'Enter') {
        handleEnter();
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key.length === 1 && /[a-zA-Zа-яА-ЯёЁ\u0590-\u05FF]/.test(e.key)) {
        handleKeyPress(e.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loading, gameState, randomMode, dictionary, wordLength, language, keyboardRtl, handleEnter, handleBackspace, handleKeyPress, handleStartGame, showWordIndexPopup, showCalendar, view]);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  const calendarOpen = showCalendar && !randomMode;
  const showKeyboard = Boolean(dictionary);

  return (
    <div 
      className="game-container"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div className="header-section">
        <div className="game-header-bar">
          <div className="game-header-side game-header-left">
            <a
              href="/"
              className="header-brand-home"
              title="Wordaholic home"
              aria-label="Wordaholic home"
            >
              <img
                className="header-brand-home-svg"
                src="/brand/wordaholic-mark.svg"
                width={34}
                height={34}
                alt=""
              />
            </a>
            <a href="/" className="header-home-link header-game-name">PolyWordlot</a>
            <button
              type="button"
              className="help-trigger help-trigger--game"
              aria-label="How to play PolyWordlot"
              onClick={() => openHelp('polywordlot')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
              </svg>
              <span className="help-trigger-tip">How to play PolyWordlot</span>
            </button>
          </div>

          <div className="game-header-side game-header-right">
            {onViewChange && (
              <>
                <span className="header-icon-with-tooltip">
                  <span className="header-icon-tooltip">Single Language Statistics</span>
                  <button
                    type="button"
                    className="header-icon-button"
                    onClick={() => {
                      setShowCalendar(false);
                      onViewChange('statistics');
                    }}
                    aria-label="Single Language Statistics"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="20" x2="18" y2="10"></line>
                      <line x1="12" y1="20" x2="12" y2="4"></line>
                      <line x1="6" y1="20" x2="6" y2="14"></line>
                    </svg>
                  </button>
                </span>
                <span className="header-icon-with-tooltip">
                  <span className="header-icon-tooltip">Cross-Language Comparison</span>
                  <button
                    type="button"
                    className="header-icon-button"
                    onClick={() => {
                      setShowCalendar(false);
                      onViewChange('statistics', 'cross-language');
                    }}
                    aria-label="Cross-Language Comparison"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7" rx="1"></rect>
                      <rect x="14" y="3" width="7" height="7" rx="1"></rect>
                      <rect x="3" y="14" width="7" height="7" rx="1"></rect>
                      <rect x="14" y="14" width="7" height="7" rx="1"></rect>
                    </svg>
                  </button>
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      <div
        ref={playAreaRef}
        className={`game-play-area${randomMode ? ' game-play-area--random' : ''}${gameState?.isComplete ? ' game-play-area--complete' : ''}`}
      >
        {randomMode && (
          <div className="random-watermark" aria-hidden="true">
            {Array.from({ length: 30 }).map((_, i) => (
              <span key={i} className="random-watermark__text">Random</span>
            ))}
          </div>
        )}
        <div className="game-play-area__content">
          {!dictionary && !loading && (
            <GameBoard
              guesses={[]}
              currentGuess={''}
              wordLength={wordLength}
              maxGuesses={MAX_GUESSES}
              isComplete={false}
              isWon={false}
              rtl={keyboardRtl}
            />
          )}
          {gameState && dictionary && (
            <>
              <GameBoard
                guesses={gameState.guesses}
                currentGuess={gameState.currentGuess}
                wordLength={wordLength}
                maxGuesses={MAX_GUESSES}
                targetWord={gameState.isComplete && !gameState.isWon ? targetWord : undefined}
                isComplete={gameState.isComplete}
                isWon={gameState.isWon}
                shakeRowIndex={shakeRowIndex}
                rtl={keyboardRtl}
              />
              {gameState.isComplete && (
                <div className="game-result">
                  {gameState.isWon ? (
                    <div className="result-message success">
                      {winMessage}
                    </div>
                  ) : (
                    <div className="result-message failure">
                      {loseMessage.replace('{word}', targetWord)}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {!gameState && dictionary && (
            <GameBoard
              guesses={[]}
              currentGuess={''}
              wordLength={wordLength}
              maxGuesses={MAX_GUESSES}
              isComplete={false}
              isWon={false}
              rtl={keyboardRtl}
            />
          )}
        </div>
      </div>
      <Settings
        userId={userId}
        language={language}
        wordLength={wordLength}
        randomMode={randomMode}
        availableLanguages={availableLanguages}
        selectedDate={selectedPlayDate || formatDate()}
        onLanguageChange={handleLanguageChange}
        onWordLengthChange={handleWordLengthChange}
        onRandomModeChange={handleRandomModeChange}
        onRestartPractice={handleRestartPractice}
        onDateChange={handleDateChange}
        showCalendar={showCalendar}
        onShowCalendarChange={setShowCalendar}
        calendarGames={calendarGames}
        calendarMonth={calendarMonth}
        onCalendarMonthChange={setCalendarMonth}
      />
      {showKeyboard ? (
        <Keyboard
          onKeyPress={handleKeyPress}
          onEnter={handleEnter}
          onBackspace={handleBackspace}
          letterStates={letterStates}
          language={language}
        />
      ) : (
        <div className="keyboard-placeholder"></div>
      )}
      {calendarOpen && (
        <div
          className="game-modal-overlay calendar-popup-overlay"
          onClick={() => setShowCalendar(false)}
          role="presentation"
        >
          <div
            className="game-modal-card calendar-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="game-modal-header">
              <h2 id="calendar-dialog-title">Daily games</h2>
              <div className="game-modal-header-actions">
                <button
                  type="button"
                  className="calendar-today-button"
                  onClick={() => {
                    handleDateChange(formatDate());
                    setShowCalendar(false);
                  }}
                >
                  Today
                </button>
                <button
                  type="button"
                  className="game-modal-close"
                  onClick={() => setShowCalendar(false)}
                  aria-label="Close calendar"
                >
                  ×
                </button>
              </div>
            </div>
            <Calendar
              games={calendarGames}
              currentMonth={calendarMonth}
              onMonthChange={setCalendarMonth}
              onDateClick={(date: string) => {
                handleDateChange(date);
                setShowCalendar(false);
              }}
              blinkingDates={calendarBlinkingDates}
            />
          </div>
        </div>
      )}
      {showWordIndexPopup && (
        <div className="word-index-overlay" onClick={() => setShowWordIndexPopup(false)}>
          <div className="word-index-popup" onClick={(e) => e.stopPropagation()}>
            <h3>Select Word by Index</h3>
            <p className="word-index-info">
              Enter a number (0–{dictionary ? dictionary.answerWordsOriginal.length - 1 : '?'}). 
              Values outside this range will wrap around.
            </p>
            <input
              type="number"
              className="word-index-input"
              value={wordIndexInput}
              onChange={(e) => setWordIndexInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && wordIndexInput.trim()) {
                  const num = parseInt(wordIndexInput.trim(), 10);
                  if (!isNaN(num)) {
                    handleStartGameWithIndex(num);
                    setShowWordIndexPopup(false);
                  }
                } else if (e.key === 'Escape') {
                  setShowWordIndexPopup(false);
                }
                e.stopPropagation();
              }}
              placeholder="Word index..."
              autoFocus
            />
            <div className="word-index-buttons">
              <button
                className="word-index-btn word-index-btn-go"
                onClick={() => {
                  const num = parseInt(wordIndexInput.trim(), 10);
                  if (!isNaN(num)) {
                    handleStartGameWithIndex(num);
                    setShowWordIndexPopup(false);
                  }
                }}
                disabled={!wordIndexInput.trim() || isNaN(parseInt(wordIndexInput.trim(), 10))}
              >
                Go
              </button>
              <button
                className="word-index-btn word-index-btn-cancel"
                onClick={() => setShowWordIndexPopup(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

