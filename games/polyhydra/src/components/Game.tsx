import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  applyInputPlugins,
  boardKnowledgeTally,
  clampBoardCount,
  evaluateGuess,
  formatDate,
  getHydraDailyWords,
  getInputPlugins,
  getKeyboardRtl,
  isValidWord,
  isWinningGuessForLanguage,
  loadDictionary,
  loadKeyboard,
  loadLoseMessage,
  loadWinMessage,
  maxGuessesForBoardCount,
  normalizeForLanguage,
  summaryKnownRows,
} from '@wordaholic/wordle-core';
import { openHelp } from '@wordaholic/help';
import { reportStats } from '@wordaholic/stats';
import { setSessionActive } from '@wordaholic/updates';
import type { DictionaryEntry, Guess, LanguageConfig, LetterState } from '../types';
import { GameBoard } from './GameBoard';
import { SummaryBoard } from './SummaryBoard';
import { Scoreboard, type ScoreboardCell } from './Scoreboard';
import { Settings } from './Settings';
import { Calendar } from './Calendar';
import {
  getStoredGame,
  hydraMaxGuesses,
  listStoredGames,
  putStoredGame,
  refreshGamesFromIndexedDb,
  STORAGE_IMPORTED_EVENT,
  type StoredHydra,
} from '../storage/platform';
import { getSelectedDate, loadPreferences, savePreferences, setSelectedDate } from '../utils/preferences';

interface GameProps {
  view?: 'game' | 'statistics';
  onViewChange?: (view: 'game' | 'statistics') => void;
  language: string;
  wordLength: number;
  boardCount: number;
  onLanguageChange: (language: string) => void;
  onWordLengthChange: (wordLength: number) => void;
  onBoardCountChange: (boardCount: number) => void;
  availableLanguages: LanguageConfig[];
}

function toGuesses(words: string[], target: string, language: string): Guess[] {
  return words.map((word) => ({ word, evaluations: evaluateGuess(word, target, language) }));
}

function usedLetterMap(boardGuesses: string[][], language: string): Map<string, LetterState> {
  const used = new Map<string, LetterState>();
  for (const words of boardGuesses) {
    for (const word of words || []) {
      for (const letter of word) {
        used.set(normalizeForLanguage(letter.toLowerCase(), language), 'absent');
      }
    }
  }
  return used;
}

function remainingTargets(targets: string[], boardGuesses: string[][], language: string): string[] {
  return targets.filter((target, i) => {
    const guesses = boardGuesses[i] || [];
    const last = guesses[guesses.length - 1];
    return !last || !isWinningGuessForLanguage(last, target, language);
  });
}

function openBoardIndices(solved: boolean[]): number[] {
  return solved.map((done, i) => (done ? -1 : i)).filter((i) => i >= 0);
}

function boardSolvedAt(words: string[] | undefined, target: string, language: string): boolean {
  const last = words?.[words.length - 1];
  return Boolean(last && isWinningGuessForLanguage(last, target, language));
}

function newlySolvedIndices(
  prevGuesses: string[][],
  nextGuesses: string[][],
  targets: string[],
  language: string
): number[] {
  const born: number[] = [];
  for (let i = 0; i < nextGuesses.length; i++) {
    if (boardSolvedAt(nextGuesses[i], targets[i], language) && !boardSolvedAt(prevGuesses[i], targets[i], language)) {
      born.push(i);
    }
  }
  return born;
}

function windowStartForBoards(
  display: number[],
  visibleCount: number,
  windowStart: number,
  mustShow: number[]
): number {
  const maxStart = Math.max(0, display.length - visibleCount);
  const start = Math.min(windowStart, maxStart);
  const vis = display.slice(start, start + visibleCount);
  if (mustShow.some((i) => vis.includes(i))) return start;
  const pos = display.indexOf(mustShow[0]);
  if (pos < 0) return start;
  return Math.max(0, Math.min(pos, maxStart));
}

const CELL_NATURAL = 60;
const CELL_GAP = 8;
/** Sticky board label + slack so "fits" means no scroll. */
const BOARD_LABEL_HEIGHT = 40;
/** Summary ↓ control with margins (not scaled with cells). */
const SUMMARY_MODE_CONTROL_HEIGHT = 56;
/**
 * Screens at least this tall must always be playable (scale as needed).
 * Shorter screens may still play if they fit at MIN_BOARD_SCALE.
 */
const TARGET_FIT_HEIGHT = 1080;
/** Floor for short screens (< TARGET_FIT_HEIGHT); below this → reject. */
const MIN_BOARD_SCALE = 0.5;
/** Absolute CSS floor when height ≥ TARGET_FIT_HEIGHT (never reject there). */
const ABS_MIN_BOARD_SCALE = 0.2;

function gridPixelHeight(scale: number, rows: number): number {
  if (rows <= 0) return 0;
  const cell = CELL_NATURAL * scale;
  const gap = CELL_GAP * scale;
  return rows * cell + (rows - 1) * gap;
}

function fullBoardPixelHeight(scale: number, rows: number): number {
  return BOARD_LABEL_HEIGHT + gridPixelHeight(scale, rows);
}

function summaryBoardPixelHeight(scale: number, wordLength: number, showEntry: boolean): number {
  const known = summaryKnownRows(wordLength);
  const entryExtra = showEntry ? CELL_GAP * scale + gridPixelHeight(scale, 1) : 0;
  return (
    BOARD_LABEL_HEIGHT +
    gridPixelHeight(scale, known) +
    SUMMARY_MODE_CONTROL_HEIGHT +
    gridPixelHeight(scale, 1) +
    entryExtra
  );
}

function scaleToFitSummary(
  availableWidth: number,
  availableHeight: number,
  naturalWidth: number,
  wordLength: number,
  showEntry: boolean
): number {
  if (availableWidth <= 0 || availableHeight <= 0 || naturalWidth <= 0) return 0;
  const scaleW = availableWidth / naturalWidth;
  const h1 = summaryBoardPixelHeight(1, wordLength, showEntry);
  const h0 = summaryBoardPixelHeight(0, wordLength, showEntry);
  const variable = h1 - h0;
  const scaleH = variable > 0 ? (availableHeight - h0) / variable : 1;
  return Math.min(1, scaleW, scaleH);
}

function widthOnlyScale(availableWidth: number, naturalWidth: number): number {
  if (availableWidth <= 0 || naturalWidth <= 0) return 0;
  return Math.min(1, availableWidth / naturalWidth);
}

/** Win: earliest solved board (fewest guesses; lowest index on tie). Loss: first unsolved. */
function finaleBoardIndex(solved: boolean[], boardGuesses: string[][], won: boolean): number {
  if (won) {
    let best = -1;
    let bestAt = Infinity;
    for (let i = 0; i < solved.length; i++) {
      if (!solved[i]) continue;
      const at = boardGuesses[i]?.length ?? Infinity;
      if (at < bestAt || (at === bestAt && (best < 0 || i < best))) {
        bestAt = at;
        best = i;
      }
    }
    return best >= 0 ? best : 0;
  }
  for (let i = 0; i < solved.length; i++) {
    if (!solved[i]) return i;
  }
  return 0;
}

export const Game: React.FC<GameProps> = ({
  view = 'game',
  onViewChange,
  language,
  wordLength,
  boardCount,
  onLanguageChange,
  onWordLengthChange,
  onBoardCountChange,
  availableLanguages,
}) => {
  const [dictionary, setDictionary] = useState<DictionaryEntry | null>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [boardGuesses, setBoardGuesses] = useState<string[][]>([]);
  const [currentGuess, setCurrentGuess] = useState('');
  const [invalidPending, setInvalidPending] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [isWon, setIsWon] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyboardRtl, setKeyboardRtl] = useState(false);
  const [winMessage, setWinMessage] = useState('Well done!');
  const [loseMessage, setLoseMessage] = useState('Out of guesses.');
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [calendarGames, setCalendarGames] = useState<StoredHydra[]>([]);
  const [selectedPlayDate, setSelectedPlayDate] = useState(() => formatDate());
  const [importTick, setImportTick] = useState(0);
  const visibleCount = 1;
  const [windowStart, setWindowStart] = useState(0);
  const [exiting, setExiting] = useState<number[]>([]);
  const [boardScale, setBoardScale] = useState(1);
  const [boardMode, setBoardMode] = useState<'summary' | 'full'>('summary');
  const [viewportTooSmall, setViewportTooSmall] = useState(false);
  const prevSolvedRef = useRef<boolean[] | null>(null);
  const finaleAppliedRef = useRef(false);
  const finaleFocusRef = useRef(false);
  const modeUserOverrideRef = useRef(false);
  const isCompleteRef = useRef(false);
  const boardModeRef = useRef(boardMode);
  const boardsViewportRef = useRef<HTMLDivElement | null>(null);
  const swipeRef = useRef<{ x: number; y: number; active: boolean } | null>(null);

  const maxGuesses = maxGuessesForBoardCount(boardCount);
  const attemptsUsed = Math.max(0, ...boardGuesses.map((g) => g.length));
  const boardNaturalWidth = wordLength * CELL_NATURAL + (wordLength - 1) * CELL_GAP;

  const selectBoardMode = useCallback((mode: 'summary' | 'full', fromUser: boolean) => {
    if (fromUser) modeUserOverrideRef.current = true;
    boardModeRef.current = mode;
    setBoardMode(mode);
  }, []);

  useEffect(() => {
    isCompleteRef.current = isComplete;
  }, [isComplete]);

  useEffect(() => {
    boardModeRef.current = boardMode;
  }, [boardMode]);

  const persist = useCallback(
    async (next: {
      targets: string[];
      boardGuesses: string[][];
      currentGuess: string;
      invalidPending: boolean;
      isComplete: boolean;
      isWon: boolean;
      date: string;
    }) => {
      const now = new Date().toISOString();
      await putStoredGame({
        language,
        word_length: wordLength,
        board_count: boardCount,
        game_date: next.date,
        target_words: next.targets,
        board_guesses: next.boardGuesses,
        current_guess: next.currentGuess,
        invalid_pending: next.invalidPending ? 1 : 0,
        is_complete: next.isComplete ? 1 : 0,
        is_won: next.isWon ? 1 : 0,
        updated_at: now,
        completed_at: next.isComplete ? now : null,
      });
      setCalendarGames((prev) => {
        const row: StoredHydra = {
          language,
          word_length: wordLength,
          board_count: boardCount,
          game_date: next.date,
          target_words: next.targets,
          board_guesses: next.boardGuesses,
          current_guess: next.currentGuess,
          invalid_pending: next.invalidPending ? 1 : 0,
          is_complete: next.isComplete ? 1 : 0,
          is_won: next.isWon ? 1 : 0,
          updated_at: now,
          completed_at: next.isComplete ? now : null,
        };
        const i = prev.findIndex((g) => g.game_date === next.date);
        if (i < 0) return [...prev, row];
        const copy = [...prev];
        copy[i] = { ...prev[i], ...row };
        return copy;
      });
    },
    [language, wordLength, boardCount]
  );

  const applyStored = useCallback((stored: StoredHydra, dict: DictionaryEntry) => {
    setTargets(stored.target_words);
    setBoardGuesses(stored.board_guesses);
    setCurrentGuess(stored.current_guess || '');
    setInvalidPending(stored.invalid_pending === 1);
    setIsComplete(stored.is_complete === 1);
    setIsWon(stored.is_won === 1);
    setDictionary(dict);
  }, []);

  const startFresh = useCallback(
    async (dict: DictionaryEntry, date: string) => {
      const words = getHydraDailyWords(dict, date, boardCount);
      setTargets(words);
      setBoardGuesses(Array.from({ length: boardCount }, () => []));
      setCurrentGuess('');
      setInvalidPending(false);
      setIsComplete(false);
      setIsWon(false);
      setDictionary(dict);
      await persist({
        targets: words,
        boardGuesses: Array.from({ length: boardCount }, () => []),
        currentGuess: '',
        invalidPending: false,
        isComplete: false,
        isWon: false,
        date,
      });
    },
    [boardCount, persist]
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const dict = await loadDictionary(language, wordLength);
        if (!dict) throw new Error('Dictionary missing');
        await loadKeyboard(language);
        const rtl = await getKeyboardRtl(language);
        const win = (await loadWinMessage(language)) || 'Well done!';
        if (cancelled) return;
        setKeyboardRtl(rtl);
        setWinMessage(win);
        const storedDate = getSelectedDate(language, wordLength, boardCount) || formatDate();
        const date = storedDate > formatDate() ? formatDate() : storedDate;
        setSelectedPlayDate(date);
        setCalendarMonth(new Date(`${date}T00:00:00`));
        const stored = await getStoredGame({
          language,
          word_length: wordLength,
          board_count: boardCount,
          game_date: date,
        });
        if (cancelled) return;
        if (stored && stored.target_words?.length === boardCount) {
          applyStored(stored, dict);
          if (stored.is_complete === 1 && stored.is_won !== 1) {
            setLoseMessage(
              await loadLoseMessage(
                language,
                remainingTargets(stored.target_words, stored.board_guesses, language).join(', ')
              )
            );
          }
        } else {
          await startFresh(dict, date);
        }
        const all = await listStoredGames();
        setCalendarGames(
          all.filter(
            (g) => g.language === language && g.word_length === wordLength && g.board_count === boardCount
          )
        );
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [language, wordLength, boardCount, selectedPlayDate, importTick, applyStored, startFresh]);

  useEffect(() => {
    const onImport = () => {
      void refreshGamesFromIndexedDb().then(() => setImportTick((n) => n + 1));
    };
    window.addEventListener(STORAGE_IMPORTED_EVENT, onImport);
    window.addEventListener('wordaholic:storage-imported', onImport);
    return () => {
      window.removeEventListener(STORAGE_IMPORTED_EVENT, onImport);
      window.removeEventListener('wordaholic:storage-imported', onImport);
    };
  }, []);

  useEffect(() => {
    setSessionActive('polyhydra', Boolean(dictionary && !isComplete));
    return () => setSessionActive('polyhydra', false);
  }, [dictionary, isComplete]);

  useEffect(() => {
    if (!showCalendar) return;
    let cancelled = false;
    void listStoredGames().then((all) => {
      if (cancelled) return;
      setCalendarGames(
        all.filter(
          (g) => g.language === language && g.word_length === wordLength && g.board_count === boardCount
        )
      );
    });
    return () => {
      cancelled = true;
    };
  }, [showCalendar, language, wordLength, boardCount]);

  const boardViews = useMemo(() => {
    return targets.map((target, i) => {
      const words = boardGuesses[i] || [];
      const guesses = toGuesses(words, target, language);
      const last = words[words.length - 1];
      const solved = Boolean(last && isWinningGuessForLanguage(last, target, language));
      return { target, guesses, solved, words };
    });
  }, [targets, boardGuesses, language]);

  const boardsSolved = boardViews.filter((board) => board.solved).length;
  const wordsLeft = Math.max(0, targets.length - boardsSolved);
  const attemptsLeft = Math.max(0, maxGuesses - attemptsUsed);
  const solvedFlags = useMemo(() => boardViews.map((board) => board.solved), [boardViews]);
  const openIndices = useMemo(() => openBoardIndices(solvedFlags), [solvedFlags]);
  const displayIndices = useMemo(() => {
    if (isComplete && exiting.length === 0) {
      return targets.map((_, i) => i);
    }
    const lingering = exiting.filter((i) => solvedFlags[i]);
    return [...new Set([...openIndices, ...lingering])].sort((a, b) => a - b);
  }, [isComplete, exiting, targets, openIndices, solvedFlags]);

  const maxWindowStart = Math.max(0, displayIndices.length - visibleCount);
  const viewStart = Math.min(windowStart, maxWindowStart);
  const visibleIndices = useMemo(
    () => displayIndices.slice(viewStart, viewStart + visibleCount),
    [displayIndices, viewStart, visibleCount]
  );

  useEffect(() => {
    setExiting([]);
    modeUserOverrideRef.current = false;
    prevSolvedRef.current = null;
    finaleAppliedRef.current = false;
    finaleFocusRef.current = false;
  }, [language, wordLength, boardCount, selectedPlayDate, importTick]);

  // Switch to Full as soon as the game ends (do not wait for exit animation).
  useEffect(() => {
    if (loading || !isComplete || finaleAppliedRef.current) return;
    finaleAppliedRef.current = true;
    setBoardMode('full');
  }, [loading, isComplete]);

  // After exit animation, focus first win / first lost board once.
  useEffect(() => {
    if (loading || !isComplete || exiting.length > 0 || finaleFocusRef.current) return;
    const focus = finaleBoardIndex(solvedFlags, boardGuesses, isWon);
    const pos = displayIndices.indexOf(focus);
    if (pos < 0) return;
    finaleFocusRef.current = true;
    setWindowStart(pos);
  }, [loading, isComplete, exiting.length, solvedFlags, boardGuesses, isWon, displayIndices]);

  useEffect(() => {
    if (loading) {
      prevSolvedRef.current = null;
      return;
    }
    const prev = prevSolvedRef.current;
    prevSolvedRef.current = solvedFlags;
    if (!prev || prev.length !== solvedFlags.length) return;
    const born: number[] = [];
    for (let i = 0; i < solvedFlags.length; i++) {
      if (solvedFlags[i] && !prev[i]) born.push(i);
    }
    if (born.length) {
      const nextEx = [...new Set([...exiting, ...born])];
      setExiting(nextEx);
      const nextDisplay = [...new Set([...openIndices, ...nextEx])].sort((a, b) => a - b);
      const nextStart = windowStartForBoards(nextDisplay, visibleCount, windowStart, born);
      if (nextStart !== windowStart) setWindowStart(nextStart);
    }
  }, [solvedFlags, loading, openIndices, exiting, windowStart, visibleCount]);

  useEffect(() => {
    if (exiting.length === 0) return;
    const snapshot = exiting;
    const t = window.setTimeout(() => {
      setExiting((ids) => ids.filter((id) => !snapshot.includes(id)));
    }, 1800);
    return () => window.clearTimeout(t);
  }, [exiting]);

  const letterStates = useMemo(() => usedLetterMap(boardGuesses, language), [boardGuesses, language]);

  const currentGuessWord = keyboardRtl ? [...currentGuess].reverse().join('') : currentGuess;
  const invalidRow = useMemo(() => {
    if (!dictionary || currentGuessWord.length !== wordLength) return false;
    return !isValidWord(currentGuessWord, dictionary);
  }, [dictionary, currentGuessWord, wordLength]);

  const scoreboardCells: ScoreboardCell[] = useMemo(
    () =>
      boardViews.map((board) => {
        const tally = boardKnowledgeTally(board.guesses, wordLength, board.target);
        return {
          solved: board.solved,
          greens: tally.greens,
          yellows: tally.yellows,
          answer: board.target,
          solvedAt: board.solved ? board.words.length : undefined,
        };
      }),
    [boardViews, wordLength]
  );

  const calendarFeed = useMemo(() => {
    const others = calendarGames.filter((g) => g.game_date !== selectedPlayDate);
    return [
      ...others.map((g) => ({
        game_date: g.game_date,
        gameEnded: g.completed_at,
        gameStarted: g.updated_at,
        isComplete: g.is_complete === 1,
        isWon: g.is_won === 1,
        guesses: (g.board_guesses || []).flat(),
      })),
      {
        game_date: selectedPlayDate,
        gameEnded: isComplete ? new Date().toISOString() : null,
        gameStarted: '',
        isComplete,
        isWon,
        guesses: boardGuesses.flat(),
      },
    ];
  }, [calendarGames, selectedPlayDate, isComplete, isWon, boardGuesses]);

  const handleDateChange = (date: string) => {
    const clipped = date > formatDate() ? formatDate() : date;
    setSelectedPlayDate(clipped);
    setSelectedDate(language, wordLength, boardCount, clipped);
  };

  const handleLanguageChange = (code: string) => {
    const langConfig = availableLanguages.find((l) => l.code === code);
    const prefs = loadPreferences();
    let nextLength = wordLength;
    if (langConfig && !langConfig.supportedLengths.includes(wordLength)) {
      nextLength = langConfig.supportedLengths[0] || 5;
      onWordLengthChange(nextLength);
    }
    savePreferences({ ...prefs, language: code, wordLength: nextLength, boardCount });
    onLanguageChange(code);
  };

  const handleWordLengthChange = (len: number) => {
    const prefs = loadPreferences();
    savePreferences({ ...prefs, wordLength: len, boardCount });
    onWordLengthChange(len);
  };

  const handleBoardCountChange = (count: number) => {
    const next = clampBoardCount(count);
    const prefs = loadPreferences();
    savePreferences({ ...prefs, boardCount: next });
    onBoardCountChange(next);
  };

  const commitState = useCallback(
    (nextGuesses: string[][], nextCurrent: string, invalid: boolean, complete: boolean, won: boolean) => {
      setBoardGuesses(nextGuesses);
      setCurrentGuess(nextCurrent);
      setInvalidPending(invalid);
      setIsComplete(complete);
      setIsWon(won);
      void persist({
        targets,
        boardGuesses: nextGuesses,
        currentGuess: nextCurrent,
        invalidPending: invalid,
        isComplete: complete,
        isWon: won,
        date: selectedPlayDate,
      });
    },
    [persist, targets, selectedPlayDate]
  );

  const handleKeyPress = useCallback(
    (key: string) => {
      if (isComplete || !dictionary) return;
      if (invalidPending) {
        setInvalidPending(false);
        void persist({
          targets,
          boardGuesses,
          currentGuess,
          invalidPending: false,
          isComplete,
          isWon,
          date: selectedPlayDate,
        });
      }
      const plugins = getInputPlugins(language);
      const transformed =
        plugins.length > 0
          ? applyInputPlugins(key.toLowerCase(), currentGuess, wordLength, keyboardRtl, plugins)
          : key.toLowerCase();
      if (currentGuess.length >= wordLength) return;
      const next = keyboardRtl ? transformed + currentGuess : currentGuess + transformed;
      setInvalidPending(false);
      setCurrentGuess(next);
      void persist({
        targets,
        boardGuesses,
        currentGuess: next,
        invalidPending: false,
        isComplete,
        isWon,
        date: selectedPlayDate,
      });
    },
    [
      isComplete,
      dictionary,
      language,
      currentGuess,
      wordLength,
      keyboardRtl,
      persist,
      targets,
      boardGuesses,
      isWon,
      selectedPlayDate,
      invalidPending,
    ]
  );

  const handleBackspace = useCallback(() => {
    if (isComplete) return;
    if (!currentGuess.length) return;
    const next = keyboardRtl ? currentGuess.slice(1) : currentGuess.slice(0, -1);
    setInvalidPending(false);
    setCurrentGuess(next);
    void persist({
      targets,
      boardGuesses,
      currentGuess: next,
      invalidPending: false,
      isComplete,
      isWon,
      date: selectedPlayDate,
    });
  }, [isComplete, currentGuess, keyboardRtl, persist, targets, boardGuesses, isWon, selectedPlayDate]);

  const handleEnter = useCallback(() => {
    if (isComplete || !dictionary) return;
    const rawGuess = keyboardRtl ? [...currentGuess].reverse().join('') : currentGuess;
    const guess = rawGuess.toLowerCase().trim();
    if (guess.length !== wordLength) return;

    if (!isValidWord(guess, dictionary)) {
      commitState(boardGuesses, '', false, false, false);
      return;
    }

    const isDailyStart = boardGuesses.every((g) => g.length === 0);
    const nextGuesses = boardGuesses.map((words, i) => {
      if (boardSolvedAt(words, targets[i], language)) return words;
      const committed = isWinningGuessForLanguage(guess, targets[i], language) ? targets[i] : guess;
      return [...words, committed];
    });
    const born = newlySolvedIndices(boardGuesses, nextGuesses, targets, language);
    if (born.length) {
      const nextEx = [...new Set([...exiting, ...born])];
      setExiting(nextEx);
      const nextOpen = openIndices.filter((i) => !born.includes(i));
      const nextDisplay = [...new Set([...nextOpen, ...nextEx])].sort((a, b) => a - b);
      const nextStart = windowStartForBoards(nextDisplay, visibleCount, windowStart, born);
      if (nextStart !== windowStart) setWindowStart(nextStart);
    }
    const won = nextGuesses.every((words, i) => boardSolvedAt(words, targets[i], language));
    const used = Math.max(0, ...nextGuesses.map((g) => g.length));
    const complete = won || used >= hydraMaxGuesses(boardCount);
    commitState(nextGuesses, '', false, complete, won);
    if (complete && !won) {
      void loadLoseMessage(language, remainingTargets(targets, nextGuesses, language).join(', ')).then(
        setLoseMessage
      );
    }
    if (isDailyStart) {
      reportStats({ games: { polyhydra: { [`${language},${wordLength},${boardCount}`]: 1 } } });
    }
  }, [
    isComplete,
    dictionary,
    keyboardRtl,
    currentGuess,
    wordLength,
    boardGuesses,
    targets,
    language,
    boardCount,
    commitState,
    exiting,
    openIndices,
    windowStart,
    visibleCount,
  ]);

  useEffect(() => {
    const scrollEntries = (delta: number) => {
      const entries = boardsViewportRef.current?.querySelector(
        '.hydra-board-entries'
      ) as HTMLElement | null;
      if (!entries) return false;
      const maxScroll = Math.max(0, entries.scrollHeight - entries.clientHeight);
      if (maxScroll <= 0) return false;
      const before = entries.scrollTop;
      entries.scrollTop = Math.max(0, Math.min(maxScroll, before + delta));
      return entries.scrollTop !== before;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (view !== 'game' || showCalendar || loading) return;
      const target = e.target as HTMLElement | null;
      const inField =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      // Always claim arrows for board nav / summary↔full — even when a settings
      // <select> is focused, otherwise Up/Down silently change the control instead.
      if (
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown'
      ) {
        e.preventDefault();
        if (inField && target) target.blur();
        if (e.key === 'ArrowLeft') setWindowStart((s) => Math.max(0, s - 1));
        else if (e.key === 'ArrowRight') setWindowStart((s) => Math.min(maxWindowStart, s + 1));
        else if (e.key === 'ArrowDown') {
          if (boardModeRef.current === 'full') scrollEntries(120);
          else selectBoardMode('full', true);
        } else if (boardModeRef.current === 'full') {
          const entries = boardsViewportRef.current?.querySelector(
            '.hydra-board-entries'
          ) as HTMLElement | null;
          if (entries && entries.scrollTop > 1) scrollEntries(-120);
          else selectBoardMode('summary', true);
        } else {
          selectBoardMode('summary', true);
        }
        return;
      }

      if (inField) return;
      if (e.key === 'Enter') handleEnter();
      else if (e.key === 'Backspace') handleBackspace();
      else if (e.key.length === 1 && /[a-zA-Zа-яА-ЯёЁ\u0590-\u05FF]/.test(e.key)) {
        handleKeyPress(e.key);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    view,
    showCalendar,
    loading,
    handleEnter,
    handleBackspace,
    handleKeyPress,
    maxWindowStart,
    selectBoardMode,
  ]);

  useEffect(() => {
    const el = boardsViewportRef.current;
    if (!el || loading) return;
    const measure = () => {
      const styles = getComputedStyle(el);
      const padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const availableWidth = Math.max(0, el.clientWidth - padX);
      const entries = el.querySelector('.hydra-board-entries') as HTMLElement | null;
      if (!entries || availableWidth <= 0) return;
      const entryStyles = getComputedStyle(entries);
      const padY =
        parseFloat(entryStyles.paddingTop) + parseFloat(entryStyles.paddingBottom);
      const availableHeight = Math.max(0, entries.clientHeight - padY);
      // Flex/layout can briefly report a tiny height — don't autoscale from that frame.
      // Summary on a collapsed pane → ask for more space; full must stay playable.
      if (availableHeight < 80) {
        if (boardModeRef.current === 'full' || isCompleteRef.current) {
          setViewportTooSmall(false);
          const scaleW = widthOnlyScale(availableWidth, boardNaturalWidth);
          setBoardScale(Math.max(ABS_MIN_BOARD_SCALE, scaleW || ABS_MIN_BOARD_SCALE));
        } else if (boardModeRef.current === 'summary') {
          setViewportTooSmall(true);
        }
        return;
      }

      const showEntry = !isCompleteRef.current;
      const scaleW = widthOnlyScale(availableWidth, boardNaturalWidth);
      const summaryScale = scaleToFitSummary(
        availableWidth,
        availableHeight,
        boardNaturalWidth,
        wordLength,
        showEntry
      );
      // ≥1080px tall: always allow summary. Shorter: keep a readable floor.
      const rejectBelow =
        (typeof window !== 'undefined' ? window.innerHeight : 0) >= TARGET_FIT_HEIGHT
          ? ABS_MIN_BOARD_SCALE
          : MIN_BOARD_SCALE;

      let mode = boardModeRef.current;
      if (!modeUserOverrideRef.current && !isCompleteRef.current) {
        const fullFits =
          fullBoardPixelHeight(Math.max(ABS_MIN_BOARD_SCALE, scaleW), maxGuesses) <=
          availableHeight + 1;
        if (fullFits) mode = 'full';
        else if (summaryScale >= rejectBelow) mode = 'summary';
        else mode = 'full'; // summary can't fit — play full with scroll
        if (mode !== boardModeRef.current) {
          boardModeRef.current = mode;
          setBoardMode(mode);
        }
      }

      // Full: width-only size + scroll. Never show the size gate.
      if (mode === 'full') {
        setViewportTooSmall(false);
        setBoardScale(Math.max(ABS_MIN_BOARD_SCALE, scaleW || ABS_MIN_BOARD_SCALE));
        return;
      }

      // Summary: must fit without scroll; otherwise ask for a bigger screen / orientation.
      if (summaryScale < rejectBelow && !isCompleteRef.current) {
        setViewportTooSmall(true);
        setBoardScale(Math.max(ABS_MIN_BOARD_SCALE, Math.min(1, summaryScale || rejectBelow)));
        return;
      }
      setViewportTooSmall(false);
      setBoardScale(Math.max(ABS_MIN_BOARD_SCALE, Math.min(1, summaryScale)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const entries = el.querySelector('.hydra-board-entries');
    if (entries) ro.observe(entries);
    return () => ro.disconnect();
  }, [
    loading,
    boardNaturalWidth,
    maxGuesses,
    wordLength,
    language,
    boardCount,
    selectedPlayDate,
    importTick,
    boardMode,
    isComplete,
  ]);

  useEffect(() => {
    setWindowStart((s) => Math.min(s, Math.max(0, displayIndices.length - visibleCount)));
  }, [displayIndices.length, visibleCount]);

  const shiftWindow = useCallback((delta: number) => {
    setWindowStart((s) => Math.max(0, Math.min(maxWindowStart, s + delta)));
  }, [maxWindowStart]);

  const scrollToBoard = (index: number) => {
    if (!displayIndices.length) return;
    let pos = displayIndices.indexOf(index);
    if (pos < 0) {
      const next = displayIndices.find((i) => i > index);
      pos = next != null ? displayIndices.indexOf(next) : displayIndices.length - 1;
    }
    setWindowStart(pos);
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="game-container hydra-container">
      {viewportTooSmall ? (
        <div className="hydra-size-gate" role="alert">
          <div className="hydra-size-gate-card">
            <p className="hydra-size-gate-title">Screen too small for summary</p>
            <p className="hydra-size-gate-body">
              Summary needs more space. Use a larger window, change orientation, or continue in
              full board mode (scrollable).
            </p>
            <button
              type="button"
              className="hydra-size-gate-full"
              onClick={() => {
                setViewportTooSmall(false);
                selectBoardMode('full', true);
              }}
            >
              Full board
            </button>
            <a className="hydra-size-gate-home" href="/">
              Wordaholic home
            </a>
          </div>
        </div>
      ) : null}
      <div className="header-section">
        <div className="game-header-bar">
          <div className="game-header-side game-header-left">
            <a href="/" className="header-brand-home" title="Wordaholic home" aria-label="Wordaholic home">
              <img className="header-brand-home-svg" src="/brand/wordaholic-mark.svg" width={34} height={34} alt="" />
            </a>
            <span className="header-game-name">PolyHydra</span>
            <button
              type="button"
              className="help-trigger help-trigger--game"
              aria-label="How to play PolyHydra"
              onClick={() => openHelp('polyhydra')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
              </svg>
              <span className="help-trigger-tip">How to play PolyHydra</span>
            </button>
          </div>
          <div
            className={`hydra-attempts${
              isComplete ? (isWon ? ' is-won' : ' is-lost') : ''
            }${isComplete ? ' is-message' : ''}`}
            title={
              isComplete ? undefined : 'Words left to guess / attempts left'
            }
            aria-label={
              isComplete
                ? isWon
                  ? winMessage
                  : loseMessage
                : `${wordsLeft} words left to guess, ${attemptsLeft} attempts left`
            }
          >
            {!isComplete ? (
              <span className="hydra-attempts-tip" role="tooltip">
                Words left to guess / attempts left
              </span>
            ) : null}
            {isComplete
              ? isWon
                ? winMessage
                : loseMessage
              : `${wordsLeft}/${attemptsLeft}`}
          </div>
          <div className="game-header-side game-header-right">
            {onViewChange && (
              <span className="header-icon-with-tooltip">
                <span className="header-icon-tooltip header-icon-tooltip--left">Statistics</span>
                <button
                  type="button"
                  className="header-icon-button"
                  onClick={() => onViewChange('statistics')}
                  aria-label="Statistics"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10"></line>
                    <line x1="12" y1="20" x2="12" y2="4"></line>
                    <line x1="6" y1="20" x2="6" y2="14"></line>
                  </svg>
                </button>
              </span>
            )}
          </div>
        </div>
        <Scoreboard
          cells={scoreboardCells}
          onSelect={scrollToBoard}
          inView={visibleIndices}
          revealed={isComplete}
        />
      </div>
      <div className={`game-play-area hydra-boards${isComplete ? ' game-play-area--complete' : ''}`}>
        <button
          type="button"
          className="hydra-nav-arrow hydra-nav-arrow--left"
          aria-label="Previous board"
          disabled={viewStart <= 0}
          onClick={() => shiftWindow(-1)}
        >
          ‹
        </button>
        <div
          className="hydra-boards-viewport"
          ref={boardsViewportRef}
          style={{
            ['--hydra-board-w' as string]: `${boardNaturalWidth * boardScale}px`,
            ['--hydra-board-scale' as string]: String(boardScale),
          }}
          onPointerDown={(e) => {
            const target = e.target as HTMLElement | null;
            // Don't capture swipes that start on controls (↓/↑, etc.) — capture steals the click.
            if (target?.closest('button, a, input, select, textarea, label')) return;
            swipeRef.current = { x: e.clientX, y: e.clientY, active: true };
            // Full mode needs native vertical scroll — don't capture the pointer.
            if (boardMode !== 'full') {
              e.currentTarget.setPointerCapture(e.pointerId);
            }
          }}
          onPointerUp={(e) => {
            const start = swipeRef.current;
            swipeRef.current = null;
            if (!start?.active) return;
            const dx = e.clientX - start.x;
            const dy = e.clientY - start.y;
            const adx = Math.abs(dx);
            const ady = Math.abs(dy);
            if (adx < 40 && ady < 40) return;
            if (ady >= adx) {
              // Vertical swipe changes mode only in summary (full uses scroll).
              if (boardMode === 'full') return;
              selectBoardMode(dy < 0 ? 'summary' : 'full', true);
              return;
            }
            shiftWindow(dx < 0 ? 1 : -1);
          }}
          onPointerCancel={() => {
            swipeRef.current = null;
          }}
        >
          <div
            className={`hydra-board-entries${boardMode === 'full' ? ' is-full-mode' : ''}`}
          >
            {visibleIndices.map((i) => {
              const board = boardViews[i];
              if (!board) return null;
              const leaving = exiting.includes(i);
              return (
                <div
                  key={i}
                  className={`hydra-board-wrap${leaving ? ' is-exiting' : ''}`}
                  onAnimationEnd={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (
                      e.animationName !== 'hydra-solved-depart' &&
                      e.animationName !== 'hydra-solved-depart-reduce'
                    ) {
                      return;
                    }
                    setExiting((ids) => ids.filter((id) => id !== i));
                  }}
                >
                  <div
                    className={`hydra-board-label${
                      board.solved ? ' guessed' : isComplete ? ' missed' : ''
                    }`}
                  >
                    {boardMode === 'full' ? (
                      <button
                        type="button"
                        className="hydra-board-mode hydra-board-mode--up"
                        aria-label="Show summary"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => selectBoardMode('summary', true)}
                      >
                        ↑
                      </button>
                    ) : (
                      <span className="hydra-board-mode hydra-board-mode--spacer" aria-hidden="true" />
                    )}
                    <span className="hydra-board-label-text">
                      {board.solved || isComplete ? board.target.toUpperCase() : i + 1}
                      {board.solved ? ` ${board.words.length}` : ''}
                    </span>
                    <span className="hydra-board-mode hydra-board-mode--spacer" aria-hidden="true" />
                  </div>
                  {boardMode === 'summary' ? (
                    <SummaryBoard
                      guesses={board.guesses}
                      currentGuess={board.solved ? '' : currentGuess}
                      wordLength={wordLength}
                      invalidRow={invalidRow && !board.solved}
                      rtl={keyboardRtl}
                      frozen={board.solved || isComplete}
                      onExpand={() => selectBoardMode('full', true)}
                    />
                  ) : (
                    <GameBoard
                      guesses={board.guesses}
                      currentGuess={board.solved ? '' : currentGuess}
                      wordLength={wordLength}
                      maxGuesses={maxGuesses}
                      targetWord={isComplete && !board.solved ? board.target : undefined}
                      isComplete={isComplete || board.solved}
                      isWon={board.solved}
                      invalidRow={invalidRow && !board.solved}
                      rtl={keyboardRtl}
                      frozen={board.solved}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          className="hydra-nav-arrow hydra-nav-arrow--right"
          aria-label="Next board"
          disabled={viewStart >= maxWindowStart}
          onClick={() => shiftWindow(1)}
        >
          ›
        </button>
      </div>
      <div className="hydra-dock">
        <Settings
          language={language}
          wordLength={wordLength}
          boardCount={boardCount}
          availableLanguages={availableLanguages}
          selectedDate={selectedPlayDate}
          onLanguageChange={handleLanguageChange}
          onWordLengthChange={handleWordLengthChange}
          onBoardCountChange={handleBoardCountChange}
          onShowCalendarChange={setShowCalendar}
        />
        <Keyboard
          onKeyPress={handleKeyPress}
          onEnter={handleEnter}
          onBackspace={handleBackspace}
          letterStates={letterStates}
          language={language}
          colorMode="used-unused"
        />
      </div>
      {showCalendar && (
        <div className="game-modal-overlay calendar-popup-overlay" onClick={() => setShowCalendar(false)} role="presentation">
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
                <button type="button" className="game-modal-close" onClick={() => setShowCalendar(false)} aria-label="Close calendar">
                  ×
                </button>
              </div>
            </div>
            <Calendar
              games={calendarFeed}
              currentMonth={calendarMonth}
              onMonthChange={setCalendarMonth}
              onDateClick={(date: string) => {
                handleDateChange(date);
                setShowCalendar(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
