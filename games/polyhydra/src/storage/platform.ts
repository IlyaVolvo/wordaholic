import { storage } from '@wordaholic/storage';
import { loadKeyboard } from '@wordaholic/wordle-core';
import { extraAttemptsForBoardCount, maxGuessesForBoardCount } from '@wordaholic/wordle-core';
import { isWinningGuessForLanguage } from '@wordaholic/wordle-core';

export const GAME_ID = 'polyhydra';
export const STORAGE_IMPORTED_EVENT = 'wordaholic:storage-imported';

export type StoredHydra = {
  language: string;
  word_length: number;
  board_count: number;
  game_date: string;
  target_words: string[];
  board_guesses: string[][];
  current_guess: string;
  invalid_pending: number;
  is_complete: number;
  is_won: number;
  updated_at: string;
  completed_at: string | null;
};

export type HydraPrefs = {
  language: string;
  wordLength: number;
  boardCount: number;
  selectedDates?: Record<string, string>;
};

type GameRecord = StoredHydra & {
  id: string;
  gameId: string;
  kind: 'game';
  numericId: number;
};

let gamesCache: Map<string, StoredHydra> | null = null;
let prefsCache: HydraPrefs | null = null;

export function gameIdentity(g: {
  language: string;
  word_length: number;
  board_count: number;
  game_date: string;
}): string {
  return `${g.language}|${g.word_length}|${g.board_count}|${g.game_date}`;
}

export function gameRecordId(g: Parameters<typeof gameIdentity>[0]): string {
  return `${GAME_ID}:game:${gameIdentity(g)}`;
}

export function asGuessLists(value: unknown, boardCount: number): string[][] {
  if (!Array.isArray(value)) return Array.from({ length: boardCount }, () => []);
  return Array.from({ length: boardCount }, (_, i) => {
    const row = value[i];
    if (!Array.isArray(row)) return [];
    return row.map((g) => (typeof g === 'string' ? g : String((g as { word?: string })?.word || ''))).filter(Boolean);
  });
}

export function hydraMaxGuesses(boardCount: number): number {
  return maxGuessesForBoardCount(boardCount);
}

export function extraAttempts(boardCount: number): number {
  return extraAttemptsForBoardCount(boardCount);
}

export function isHydraWon(game: StoredHydra): boolean {
  if (game.is_won === 1) return true;
  const targets = game.target_words || [];
  if (!targets.length) return false;
  return targets.every((target, i) => {
    const guesses = game.board_guesses?.[i] || [];
    const last = guesses[guesses.length - 1];
    return Boolean(last && isWinningGuessForLanguage(last, target, game.language));
  });
}

export function isHydraComplete(game: StoredHydra): boolean {
  if (isHydraWon(game)) return true;
  if (game.is_complete === 1) return true;
  const max = hydraMaxGuesses(game.board_count);
  const used = Math.max(0, ...asGuessLists(game.board_guesses, game.board_count).map((g) => g.length));
  return used >= max;
}

function toRecord(game: StoredHydra, numericId = 0): GameRecord {
  return {
    ...game,
    id: gameRecordId(game),
    gameId: GAME_ID,
    kind: 'game',
    numericId,
  };
}

function fromRecord(row: Record<string, unknown>): StoredHydra | null {
  const language = String(row.language || '').trim();
  const word_length = Number(row.word_length);
  const board_count = Number(row.board_count);
  const game_date = String(row.game_date || '');
  const dateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(game_date);
  if (!language || !word_length || !board_count || !dateMatch) return null;
  const targets = Array.isArray(row.target_words)
    ? row.target_words.map((w) => String(w))
    : [];
  return {
    language,
    word_length,
    board_count,
    game_date: dateMatch[1],
    target_words: targets,
    board_guesses: asGuessLists(row.board_guesses, board_count),
    current_guess: String(row.current_guess || ''),
    invalid_pending: Number(row.invalid_pending) || 0,
    is_complete: Number(row.is_complete) || 0,
    is_won: Number(row.is_won) || 0,
    updated_at: String(row.updated_at || new Date().toISOString()),
    completed_at: row.completed_at ? String(row.completed_at) : null,
  };
}

export async function refreshGamesFromIndexedDb(): Promise<StoredHydra[]> {
  gamesCache = null;
  const rows = (await storage.listRecords(GAME_ID)) as GameRecord[];
  const languages = [
    ...new Set(rows.map((row) => String(row.language || '').trim()).filter(Boolean)),
  ];
  await Promise.all(languages.map((language) => loadKeyboard(language)));
  const map = new Map<string, StoredHydra>();
  for (const row of rows) {
    const game = fromRecord(row);
    if (!game) continue;
    const complete = isHydraComplete(game);
    const won = isHydraWon(game);
    const next: StoredHydra = {
      ...game,
      is_complete: complete ? 1 : 0,
      is_won: won ? 1 : 0,
      completed_at: complete ? game.completed_at || game.updated_at : game.completed_at,
    };
    map.set(gameIdentity(next), next);
  }
  gamesCache = map;
  return [...map.values()];
}

async function loadGamesMap(): Promise<Map<string, StoredHydra>> {
  if (gamesCache) return gamesCache;
  await refreshGamesFromIndexedDb();
  return gamesCache || new Map();
}

export async function listStoredGames(): Promise<StoredHydra[]> {
  return [...(await loadGamesMap()).values()];
}

export async function putStoredGame(game: StoredHydra): Promise<void> {
  const next: StoredHydra = {
    ...game,
    board_guesses: asGuessLists(game.board_guesses, game.board_count),
    target_words: [...(game.target_words || [])],
  };
  await storage.putRecord(toRecord(next));
  const map = gamesCache || new Map();
  map.set(gameIdentity(next), next);
  gamesCache = map;
}

export async function getStoredGame(params: {
  language: string;
  word_length: number;
  board_count: number;
  game_date: string;
}): Promise<StoredHydra | null> {
  const map = await loadGamesMap();
  return map.get(gameIdentity(params)) || null;
}

export async function getPrefs(): Promise<HydraPrefs | null> {
  if (prefsCache) {
    return { ...prefsCache, selectedDates: { ...prefsCache.selectedDates } };
  }
  const value = (await storage.getGameState(GAME_ID, 'prefs')) as HydraPrefs | null;
  prefsCache = value;
  return value ? { ...value, selectedDates: { ...value.selectedDates } } : null;
}

export async function setPrefs(prefs: HydraPrefs): Promise<void> {
  prefsCache = { ...prefs, selectedDates: { ...prefs.selectedDates } };
  await storage.setGameState(GAME_ID, 'prefs', prefsCache);
}

if (typeof window !== 'undefined') {
  window.addEventListener(STORAGE_IMPORTED_EVENT, (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (detail?.gameId && detail.gameId !== GAME_ID) return;
    gamesCache = null;
  });
}
