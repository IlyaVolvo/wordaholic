import {
  ensurePolywordlotMigrated,
  getPrefs,
  setPrefs,
  type PolywordlotPrefs,
} from '../storage/platform';

export type UserPreferences = PolywordlotPrefs;

function getDefaultLanguage(): string {
  try {
    const browserLang = navigator.language || (navigator as { userLanguage?: string }).userLanguage || 'en';
    const langCode = browserLang.split('-')[0].toLowerCase();
    const localeMap: Record<string, string> = {
      en: 'en',
      ru: 'ru',
      fr: 'fr',
      es: 'es',
      de: 'de',
      it: 'it',
    };
    return localeMap[langCode] || 'en';
  } catch {
    return 'en';
  }
}

const DEFAULT_PREFERENCES: UserPreferences = {
  randomMode: false,
  language: getDefaultLanguage(),
  wordLength: 5,
  selectedLanguages: undefined,
  selectedDates: {},
};

let cache: UserPreferences = { ...DEFAULT_PREFERENCES, selectedDates: {} };
let ready = false;

export async function initPreferences(): Promise<UserPreferences> {
  await ensurePolywordlotMigrated();
  const stored = await getPrefs();
  cache = {
    ...DEFAULT_PREFERENCES,
    ...stored,
    language: stored?.language || DEFAULT_PREFERENCES.language,
    selectedDates: { ...DEFAULT_PREFERENCES.selectedDates, ...stored?.selectedDates },
  };
  ready = true;
  return loadPreferences();
}

export function loadPreferences(): UserPreferences {
  if (!ready) {
    return { ...DEFAULT_PREFERENCES, selectedDates: {} };
  }
  return { ...cache, selectedDates: { ...cache.selectedDates } };
}

export function savePreferences(preferences: UserPreferences): void {
  cache = {
    ...DEFAULT_PREFERENCES,
    ...preferences,
    selectedDates: { ...preferences.selectedDates },
  };
  void setPrefs(cache);
}

export function dateKey(lang: string, len: number): string {
  return `${lang}_${len}`;
}

export function getSelectedDate(lang: string, len: number): string | null {
  const key = dateKey(lang, len);
  return cache.selectedDates?.[key] || null;
}

export function setSelectedDate(lang: string, len: number, date: string): void {
  cache = {
    ...cache,
    selectedDates: { ...cache.selectedDates, [dateKey(lang, len)]: date },
  };
  void setPrefs(cache);
}
