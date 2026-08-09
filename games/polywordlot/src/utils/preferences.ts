const PREFERENCES_KEY = 'wordle-multi-preferences';

export interface UserPreferences {
  randomMode: boolean; // If true, new word every game
  language: string; // Selected language code
  wordLength: number; // Selected word length
  selectedLanguages?: string[]; // Array of language codes the user wants to play
}

/**
 * Get default language based on browser locale
 */
function getDefaultLanguage(): string {
  try {
    const browserLang = navigator.language || (navigator as any).userLanguage || 'en';
    const langCode = browserLang.split('-')[0].toLowerCase();
    
    // Map common browser locales to supported language codes
    const localeMap: Record<string, string> = {
      'en': 'en',
      'ru': 'ru',
      'fr': 'fr',
      'es': 'es',
      'de': 'de',
      'it': 'it', // Italian (if supported)
    };
    
    return localeMap[langCode] || 'en'; // Default to English
  } catch {
    return 'en';
  }
}

const DEFAULT_PREFERENCES: UserPreferences = {
  randomMode: false,
  language: getDefaultLanguage(),
  wordLength: 5,
  selectedLanguages: undefined, // undefined means all languages are available
};

/**
 * Loads user preferences from localStorage
 */
export function loadPreferences(): UserPreferences {
  try {
    const stored = localStorage.getItem(PREFERENCES_KEY);
    if (!stored) return DEFAULT_PREFERENCES;
    
    const prefs = JSON.parse(stored);
    const loaded = { ...DEFAULT_PREFERENCES, ...prefs };
    
    // Ensure language is set (in case it wasn't saved before)
    if (!loaded.language) {
      loaded.language = getDefaultLanguage();
    }
    
    return loaded;
  } catch (error) {
    console.error('Failed to load preferences:', error);
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Saves user preferences to localStorage
 */
export function savePreferences(preferences: UserPreferences): void {
  try {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.error('Failed to save preferences:', error);
  }
}

