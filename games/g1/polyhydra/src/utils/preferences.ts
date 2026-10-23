import { getPrefs, setPrefs, type HydraPrefs } from '../storage/platform';
import { DEFAULT_BOARD_COUNT } from '@wordaholic/wordle-core';

function getDefaultLanguage(): string {
  try {
    const browserLang = navigator.language || 'en';
    return browserLang.split('-')[0].toLowerCase() || 'en';
  } catch {
    return 'en';
  }
}

const DEFAULT_PREFERENCES: HydraPrefs = {
  language: getDefaultLanguage(),
  wordLength: 5,
  boardCount: DEFAULT_BOARD_COUNT,
  selectedDates: {},
  boardModes: {},
};

function asBoardMode(value: unknown): 'summary' | 'full' | undefined {
  return value === 'summary' || value === 'full' ? value : undefined;
}

function asBoardModes(value: unknown): Record<string, 'summary' | 'full'> {
  if (!value || typeof value !== 'object') return {};
  const next: Record<string, 'summary' | 'full'> = {};
  for (const [key, mode] of Object.entries(value as Record<string, unknown>)) {
    const parsed = asBoardMode(mode);
    if (parsed) next[key] = parsed;
  }
  return next;
}

let cache: HydraPrefs = { ...DEFAULT_PREFERENCES, selectedDates: {} };
let ready = false;

export async function initPreferences(): Promise<HydraPrefs> {
  const stored = await getPrefs();
  const boardCount = stored?.boardCount || DEFAULT_PREFERENCES.boardCount;
  const boardModes = asBoardModes(stored?.boardModes);
  const legacy = asBoardMode(stored?.boardMode);
  const countKey = String(boardCount);
  const migrated = Boolean(legacy && !boardModes[countKey]);
  if (migrated && legacy) boardModes[countKey] = legacy;
  cache = {
    ...DEFAULT_PREFERENCES,
    ...stored,
    language: stored?.language || DEFAULT_PREFERENCES.language,
    wordLength: stored?.wordLength || DEFAULT_PREFERENCES.wordLength,
    boardCount,
    selectedDates: { ...DEFAULT_PREFERENCES.selectedDates, ...stored?.selectedDates },
    boardModes,
    boardMode: undefined,
  };
  ready = true;
  if (migrated) void setPrefs(cache);
  return loadPreferences();
}

export function loadPreferences(): HydraPrefs {
  if (!ready) return { ...DEFAULT_PREFERENCES, selectedDates: {}, boardModes: {} };
  return {
    ...cache,
    selectedDates: { ...cache.selectedDates },
    boardModes: { ...cache.boardModes },
  };
}

export function savePreferences(preferences: HydraPrefs): void {
  cache = {
    ...DEFAULT_PREFERENCES,
    ...preferences,
    selectedDates: { ...preferences.selectedDates },
    boardModes: asBoardModes(preferences.boardModes),
    boardMode: asBoardMode(preferences.boardMode),
  };
  void setPrefs(cache);
}

export function dateKey(lang: string, len: number, boards: number): string {
  return `${lang}_${len}_${boards}`;
}

export function getSelectedDate(lang: string, len: number, boards: number): string | null {
  return cache.selectedDates?.[dateKey(lang, len, boards)] || null;
}

export function storedBoardMode(boardCount: number): 'summary' | 'full' | null {
  return asBoardMode(cache.boardModes?.[String(boardCount)]) ?? null;
}

export function setBoardModePref(boardCount: number, mode: 'summary' | 'full'): void {
  cache = {
    ...cache,
    boardModes: { ...cache.boardModes, [String(boardCount)]: mode },
  };
  void setPrefs(cache);
}

export function setSelectedDate(lang: string, len: number, boards: number, date: string): void {
  cache = {
    ...cache,
    selectedDates: { ...cache.selectedDates, [dateKey(lang, len, boards)]: date },
  };
  void setPrefs(cache);
}
