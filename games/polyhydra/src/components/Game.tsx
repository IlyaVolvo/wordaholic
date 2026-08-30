import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  applyInputPlugins,
  boardKnowledgeScore,
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
} from '@wordaholic/wordle-core';
import { openHelp } from '@wordaholic/help';
import { reportStats } from '@wordaholic/stats';
import { setSessionActive } from '@wordaholic/updates';
import type { DictionaryEntry, Guess, LanguageConfig, LetterState } from '../types';
import { GameBoard } from './GameBoard';
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
  const [visibleCount, setVisibleCount] = useState(1);
  const [windowStart, setWindowStart] = useState(0);
  const [exiting, setExiting] = useState<number[]>([]);
  const prevSolvedRef = useRef<boolean[] | null>(null);
  const boardsViewportRef = useRef<HTMLDivElement | null>(null);
  const swipeRef = useRef<{ x: number; y: number; active: boolean } | null>(null);

  const maxGuesses = maxGuessesForBoardCount(boardCount);
  const attemptsUsed = Math.max(0, ...boardGuesses.map((g) => g.length));
  const CELL_NATURAL = 60;
  const CELL_GAP = 8;
  const BOARD_GAP = CELL_GAP * 4 - 2;
  const PAGE_PAD_X = 24;
  const boardNaturalWidth = wordLength * CELL_NATURAL + (wordLength - 1) * CELL_GAP;

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
  const solvedFlags = useMemo(() => boardViews.map((board) => board.solved), [boardViews]);
  const openIndices = useMemo(() => openBoardIndices(solvedFlags), [solvedFlags]);
  const displayIndices = useMemo(() => {
    const lingering = exiting.filter((i) => solvedFlags[i]);
    return [...new Set([...openIndices, ...lingering])].sort((a, b) => a - b);
  }, [openIndices, exiting, solvedFlags]);

  const maxWindowStart = Math.max(0, displayIndices.length - visibleCount);
  const viewStart = Math.min(windowStart, maxWindowStart);
  const visibleIndices = useMemo(
    () => displayIndices.slice(viewStart, viewStart + visibleCount),
    [displayIndices, viewStart, visibleCount]
  );

  useEffect(() => {
    setExiting([]);
    prevSolvedRef.current = null;
  }, [language, wordLength, boardCount, selectedPlayDate, importTick]);

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
    if (born.length) setExiting((ids) => [...new Set([...ids, ...born])]);
  }, [solvedFlags, loading]);

  const letterStates = useMemo(() => usedLetterMap(boardGuesses, language), [boardGuesses, language]);

  const scoreboardCells: ScoreboardCell[] = useMemo(
    () =>
      boardViews.map((board) => ({
        solved: board.solved,
        score: boardKnowledgeScore(board.guesses, wordLength, board.target),
        answer: board.target,
        solvedAt: board.solved ? board.words.length : undefined,
      })),
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
      if (invalidPending) {
        commitState(boardGuesses, '', false, false, false);
        return;
      }
      setInvalidPending(true);
      void persist({
        targets,
        boardGuesses,
        currentGuess,
        invalidPending: true,
        isComplete,
        isWon,
        date: selectedPlayDate,
      });
      return;
    }

    const isDailyStart = boardGuesses.every((g) => g.length === 0);
    const nextGuesses = boardGuesses.map((words, i) => {
      const last = words[words.length - 1];
      const solved = Boolean(last && isWinningGuessForLanguage(last, targets[i], language));
      if (solved) return words;
      const committed = isWinningGuessForLanguage(guess, targets[i], language) ? targets[i] : guess;
      return [...words, committed];
    });
    const won = nextGuesses.every((words, i) => {
      const last = words[words.length - 1];
      return Boolean(last && isWinningGuessForLanguage(last, targets[i], language));
    });
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
    invalidPending,
    boardGuesses,
    targets,
    language,
    boardCount,
    commitState,
    persist,
    isWon,
    selectedPlayDate,
  ]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (view !== 'game' || showCalendar || loading) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setWindowStart((s) => Math.max(0, s - 1));
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setWindowStart((s) => Math.min(maxWindowStart, s + 1));
        return;
      }
      if (e.key === 'Enter') handleEnter();
      else if (e.key === 'Backspace') handleBackspace();
      else if (e.key.length === 1 && /[a-zA-Zа-яА-ЯёЁ\u0590-\u05FF]/.test(e.key)) {
        handleKeyPress(e.key);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, showCalendar, loading, handleEnter, handleBackspace, handleKeyPress, maxWindowStart]);

  useEffect(() => {
    const el = boardsViewportRef.current;
    if (!el) return;
    const measure = () => {
      const inner = Math.max(0, el.clientWidth - PAGE_PAD_X);
      const fit = Math.max(1, Math.floor((inner + BOARD_GAP) / (boardNaturalWidth + BOARD_GAP)));
      setVisibleCount(Math.min(fit, Math.max(1, displayIndices.length || 1)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [
    loading,
    boardNaturalWidth,
    PAGE_PAD_X,
    BOARD_GAP,
    displayIndices.length,
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
    setWindowStart(() => {
      if (pos < viewStart) return pos;
      if (pos >= viewStart + visibleCount) return Math.max(0, pos - visibleCount + 1);
      return viewStart;
    });
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="game-container hydra-container">
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
            className={`hydra-attempts${isComplete && !isWon ? ' is-lost' : ''}`}
            aria-label={
              isComplete && !isWon
                ? 'Lost'
                : `${boardsSolved} solved, ${attemptsUsed} of ${maxGuesses} attempts`
            }
          >
            {isComplete && !isWon ? 'Lost' : `${boardsSolved} - ${attemptsUsed}/${maxGuesses}`}
          </div>
          <div className="game-header-side game-header-right">
            {onViewChange && (
              <span className="header-icon-with-tooltip">
                <span className="header-icon-tooltip">Statistics</span>
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
          style={{ ['--hydra-board-w' as string]: `${boardNaturalWidth}px` }}
          onPointerDown={(e) => {
            swipeRef.current = { x: e.clientX, y: e.clientY, active: true };
          }}
          onPointerUp={(e) => {
            const start = swipeRef.current;
            swipeRef.current = null;
            if (!start?.active) return;
            const dx = e.clientX - start.x;
            const dy = e.clientY - start.y;
            if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
            shiftWindow(dx < 0 ? 1 : -1);
          }}
          onPointerCancel={() => {
            swipeRef.current = null;
          }}
        >
          <div className="hydra-board-entries">
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
                    {board.solved || isComplete ? board.target.toUpperCase() : i + 1}
                    {board.solved ? ` ${board.words.length}` : ''}
                  </div>
                  <GameBoard
                    guesses={board.guesses}
                    currentGuess={board.solved ? '' : currentGuess}
                    wordLength={wordLength}
                    maxGuesses={maxGuesses}
                    targetWord={isComplete && !board.solved ? board.target : undefined}
                    isComplete={isComplete || board.solved}
                    isWon={board.solved}
                    invalidRow={invalidPending && !board.solved}
                    rtl={keyboardRtl}
                    frozen={board.solved}
                  />
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
        {isComplete && (
          <div className="game-result">
            <div className={`result-message ${isWon ? 'success' : 'failure'}`}>
              {isWon ? winMessage : 'Lost'}
            </div>
          </div>
        )}
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
