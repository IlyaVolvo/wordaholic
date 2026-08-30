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
};

let cache: HydraPrefs = { ...DEFAULT_PREFERENCES, selectedDates: {} };
let ready = false;

export async function initPreferences(): Promise<HydraPrefs> {
  const stored = await getPrefs();
  cache = {
    ...DEFAULT_PREFERENCES,
    ...stored,
    language: stored?.language || DEFAULT_PREFERENCES.language,
    wordLength: stored?.wordLength || DEFAULT_PREFERENCES.wordLength,
    boardCount: stored?.boardCount || DEFAULT_PREFERENCES.boardCount,
    selectedDates: { ...DEFAULT_PREFERENCES.selectedDates, ...stored?.selectedDates },
  };
  ready = true;
  return loadPreferences();
}

export function loadPreferences(): HydraPrefs {
  if (!ready) return { ...DEFAULT_PREFERENCES, selectedDates: {} };
  return { ...cache, selectedDates: { ...cache.selectedDates } };
}

export function savePreferences(preferences: HydraPrefs): void {
  cache = {
    ...DEFAULT_PREFERENCES,
    ...preferences,
    selectedDates: { ...preferences.selectedDates },
  };
  void setPrefs(cache);
}

export function dateKey(lang: string, len: number, boards: number): string {
  return `${lang}_${len}_${boards}`;
}

export function getSelectedDate(lang: string, len: number, boards: number): string | null {
  return cache.selectedDates?.[dateKey(lang, len, boards)] || null;
}

export function setSelectedDate(lang: string, len: number, boards: number, date: string): void {
  cache = {
    ...cache,
    selectedDates: { ...cache.selectedDates, [dateKey(lang, len, boards)]: date },
  };
  void setPrefs(cache);
}
