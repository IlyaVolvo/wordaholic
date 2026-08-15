/**
 * PolyWordlot persistence on the platform IndexedDB envelope.
 * Games (in-progress and completed) are records; prefs live in gameState.
 */
import { storage } from '@wordaholic/storage';
import { loadKeyboard } from '../data/languageLoader';
import { isWinningGuessForLanguage } from '../utils/characterNormalization';

export const STORAGE_IMPORTED_EVENT = 'wordaholic:storage-imported';
const MAX_GUESSES = 6;

export const GAME_ID = 'polywordlot';

const LS_STORE = 'wordaholic-polywordlot-v1';
const LS_PREFS = 'wordle-multi-preferences';
const LS_LIVE_STATE = 'wordle-multi-game-state';
const MIGRATE_META = 'polywordlot-ls-migrated';

export type StoredGame = {
  id: number;
  language: string;
  word_length: number;
  target_word: string;
  game_date: string;
  is_random_mode: number;
  word_seed: number | null;
  is_complete: number;
  guesses: string[];
  updated_at: string;
  completed_at: string | null;
};

export type PolywordlotPrefs = {
  randomMode: boolean;
  language: string;
  wordLength: number;
  selectedLanguages?: string[];
  selectedDates?: Record<string, string>;
};

type GameRecord = Omit<StoredGame, 'id'> & {
  id: string;
  gameId: string;
  kind: 'game';
  numericId: number;
};

type Meta = { nextId: number };

let migrateLock: Promise<void> | null = null;
let gamesCache: Map<string, StoredGame> | null = null;
let metaCache: Meta | null = null;
let prefsCache: PolywordlotPrefs | null = null;
let feedbackCache: string[] | null = null;

export function gameIdentity(g: {
  language: string;
  word_length: number;
  game_date: string;
  is_random_mode: number;
  word_seed?: number | null;
}): string {
  return `${g.language}|${g.word_length}|${g.game_date}|${g.is_random_mode}|${g.word_seed ?? ''}`;
}

export function gameRecordId(g: Parameters<typeof gameIdentity>[0]): string {
  return `${GAME_ID}:game:${gameIdentity(g)}`;
}

export function asGuessWords(guesses: unknown): string[] {
  if (!Array.isArray(guesses)) return [];
  return guesses
    .map((g) => (typeof g === 'string' ? g : g && typeof g === 'object' ? String(g.word || '') : ''))
    .filter(Boolean);
}

export async function ensurePolywordlotMigrated(): Promise<void> {
  if (!migrateLock) migrateLock = migrateOnce();
  return migrateLock;
}

async function migrateOnce(): Promise<void> {
  await storage.open();
  if (await storage.getMetadata(MIGRATE_META, false)) return;

  const legacy = readLegacyStore();
  const legacyPrefs = readLegacyPrefs();
  const selectedDates = readLegacySelectedDates();

  let maxId = legacy.nextId || 1;
  for (const game of legacy.games) {
    if (!game || typeof game !== 'object') continue;
    if (Number((game as StoredGame).is_random_mode) === 1) continue;
    await putStoredGame(game as StoredGame, { skipCache: true });
    maxId = Math.max(maxId, (game.id || 0) + 1);
  }

  const prefs: PolywordlotPrefs = {
    randomMode: legacyPrefs.randomMode === true,
    language: typeof legacyPrefs.language === 'string' ? legacyPrefs.language : 'en',
    wordLength: Number(legacyPrefs.wordLength) || 5,
    selectedLanguages: Array.isArray(legacyPrefs.selectedLanguages)
      ? legacyPrefs.selectedLanguages
      : legacy.selectedLanguages || undefined,
    selectedDates,
  };
  await storage.setGameState(GAME_ID, 'prefs', prefs);
  await storage.setGameState(GAME_ID, 'meta', { nextId: maxId });
  await storage.setGameState(GAME_ID, 'feedback', Array.isArray(legacy.feedback) ? legacy.feedback : []);

  await storage.setMetadata(MIGRATE_META, true);
  await purgePracticeRecords();
  clearLegacyLocalStorage();
  gamesCache = null;
  metaCache = { nextId: maxId };
  prefsCache = prefs;
  feedbackCache = Array.isArray(legacy.feedback) ? [...legacy.feedback] : [];
}

function readLegacyStore(): {
  nextId: number;
  games: StoredGame[];
  selectedLanguages: string[] | null;
  feedback: string[];
} {
  try {
    const raw = localStorage.getItem(LS_STORE);
    if (!raw) {
      return { nextId: 1, games: [], selectedLanguages: null, feedback: [] };
    }
    const parsed = JSON.parse(raw);
    return {
      nextId: parsed.nextId || 1,
      games: Array.isArray(parsed.games) ? parsed.games : [],
      selectedLanguages: parsed.selectedLanguages ?? null,
      feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
    };
  } catch {
    return { nextId: 1, games: [], selectedLanguages: null, feedback: [] };
  }
}

function readLegacyPrefs(): Partial<PolywordlotPrefs> {
  try {
    const raw = localStorage.getItem(LS_PREFS);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<PolywordlotPrefs>;
  } catch {
    return {};
  }
}

function readLegacySelectedDates(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith('selectedDate_')) continue;
      const value = localStorage.getItem(key);
      if (value) out[key.slice('selectedDate_'.length)] = value;
    }
  } catch {
    /* ignore */
  }
  return out;
}

function clearLegacyLocalStorage(): void {
  try {
    localStorage.removeItem(LS_STORE);
    localStorage.removeItem(LS_PREFS);
    localStorage.removeItem(LS_LIVE_STATE);
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith('selectedDate_')) toRemove.push(key);
    }
    for (const key of toRemove) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function toRecord(game: StoredGame): GameRecord {
  return {
    ...game,
    id: gameRecordId(game),
    gameId: GAME_ID,
    kind: 'game',
    numericId: game.id,
  };
}

function fromRecord(row: GameRecord | Record<string, unknown>): StoredGame | null {
  if (!row || typeof row !== 'object') return null;
  const language = String(row.language || '');
  if (!language) return null;
  const guesses = asGuessWords(row.guesses);
  const target_word = String(row.target_word || '');
  const statedLength = Number(row.word_length);
  const word_length =
    Number.isFinite(statedLength) && statedLength > 0
      ? statedLength
      : guesses[0]?.length || target_word.length || 0;
  const gameDateRaw = String(row.game_date || '');
  const gameDateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(gameDateRaw.trim());
  const numericId = Number(row.numericId ?? row.id) || 0;
  return {
    id: numericId,
    language,
    word_length,
    target_word,
    game_date: gameDateMatch ? gameDateMatch[1] : gameDateRaw,
    is_random_mode: Number(row.is_random_mode) || 0,
    word_seed: row.word_seed == null ? null : Number(row.word_seed),
    is_complete: Number(row.is_complete) || 0,
    guesses,
    updated_at: String(row.updated_at || new Date().toISOString()),
    completed_at: row.completed_at ? String(row.completed_at) : null,
  };
}

async function purgePracticeRecords(): Promise<void> {
  const rows = await storage.listRecords(GAME_ID);
  for (const row of rows) {
    if (Number(row.is_random_mode) !== 1) continue;
    await storage.deleteRecord(row.id);
  }
  if (gamesCache) {
    for (const [id, game] of [...gamesCache.entries()]) {
      if (game.is_random_mode) gamesCache.delete(id);
    }
  }
}

function isCompletedDaily(game: StoredGame): boolean {
  if (game.is_random_mode) return false;
  if (game.guesses.length >= MAX_GUESSES) return true;
  const last = game.guesses[game.guesses.length - 1];
  if (last && game.target_word && isWinningGuessForLanguage(last, game.target_word, game.language)) {
    return true;
  }
  return game.is_complete === 1;
}

/**
 * Drop in-memory game state and rebuild it from IndexedDB, the same way a
 * fresh start does. Imported rows become playable/visible after this.
 */
export async function refreshGamesFromIndexedDb(): Promise<StoredGame[]> {
  await ensurePolywordlotMigrated();
  gamesCache = null;
  await purgePracticeRecords();
  const rows = (await storage.listRecords(GAME_ID)) as GameRecord[];
  const languages = [
    ...new Set(rows.map((row) => String(row.language || '').trim()).filter((language) => language.length > 0)),
  ];
  await Promise.all(languages.map((language) => loadKeyboard(language)));

  const map = new Map<string, StoredGame>();
  for (const row of rows) {
    const game = fromRecord(row as GameRecord);
    if (!game || game.is_random_mode) continue;
    const complete = isCompletedDaily(game);
    const next: StoredGame = {
      ...game,
      is_complete: complete ? 1 : 0,
      completed_at: complete ? game.completed_at || game.updated_at : game.completed_at,
    };
    map.set(gameIdentity(next), next);
    const rawGuesses = (row as GameRecord).guesses;
    const needsRewrite =
      next.is_complete !== Number(row.is_complete) ||
      next.game_date !== String(row.game_date || '') ||
      (Array.isArray(rawGuesses) && rawGuesses.some((guess) => typeof guess !== 'string'));
    if (needsRewrite) await putStoredGame(next, { skipCache: true });
  }
  gamesCache = map;
  return [...map.values()];
}

async function loadGamesMap(): Promise<Map<string, StoredGame>> {
  if (gamesCache) return gamesCache;
  await refreshGamesFromIndexedDb();
  return gamesCache || new Map();
}

export async function listStoredGames(): Promise<StoredGame[]> {
  const map = await loadGamesMap();
  return [...map.values()];
}

export async function putStoredGame(
  game: StoredGame,
  opts: { skipCache?: boolean } = {}
): Promise<void> {
  if (Number(game.is_random_mode) === 1) return;
  if (!opts.skipCache) await ensurePolywordlotMigrated();
  const next = { ...game, guesses: asGuessWords(game.guesses) };
  await storage.putRecord(toRecord(next));
  if (!opts.skipCache) {
    const map = gamesCache || new Map();
    map.set(gameIdentity(next), next);
    gamesCache = map;
  }
}

export async function getMeta(): Promise<Meta> {
  await ensurePolywordlotMigrated();
  if (metaCache) return { ...metaCache };
  const value = (await storage.getGameState(GAME_ID, 'meta')) as Meta | null;
  metaCache = { nextId: value?.nextId || 1 };
  return { ...metaCache };
}

export async function setMeta(meta: Meta): Promise<void> {
  metaCache = { nextId: meta.nextId };
  await storage.setGameState(GAME_ID, 'meta', metaCache);
}

export async function getPrefs(): Promise<PolywordlotPrefs | null> {
  await ensurePolywordlotMigrated();
  if (prefsCache) return { ...prefsCache, selectedDates: { ...prefsCache.selectedDates } };
  const value = (await storage.getGameState(GAME_ID, 'prefs')) as PolywordlotPrefs | null;
  prefsCache = value;
  return value ? { ...value, selectedDates: { ...value.selectedDates } } : null;
}

export async function setPrefs(prefs: PolywordlotPrefs): Promise<void> {
  prefsCache = { ...prefs, selectedDates: { ...prefs.selectedDates } };
  await storage.setGameState(GAME_ID, 'prefs', prefsCache);
}

export async function getFeedback(): Promise<string[]> {
  await ensurePolywordlotMigrated();
  if (feedbackCache) return [...feedbackCache];
  const value = (await storage.getGameState(GAME_ID, 'feedback')) as string[] | null;
  feedbackCache = Array.isArray(value) ? value : [];
  return [...feedbackCache];
}

export async function appendFeedback(comment: string): Promise<void> {
  const list = await getFeedback();
  list.push(comment);
  feedbackCache = list;
  await storage.setGameState(GAME_ID, 'feedback', list);
}
