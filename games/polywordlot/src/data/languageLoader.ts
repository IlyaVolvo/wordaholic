import type { DictionaryEntry, LanguageConfig } from '../types';

const DICT_BASE = `${import.meta.env.BASE_URL}dict/`;
/** Shared language definitions: /word-data/<Language>/<locale>/language.json */
const WORD_DATA_BASE = '/word-data/';

// Cache for loaded dictionaries
const dictionaryCache = new Map<string, DictionaryEntry>();

// Cache for detected supported lengths per language
const supportedLengthsCache = new Map<string, number[]>();

// Cache for language configurations (discovered from directory structure)
const languageConfigsCache = new Map<string, LanguageConfig>();

// Cache for keyboard layouts
const keyboardCache = new Map<string, string[][]>();

// Cache for keyboard action buttons
export interface KeyboardActions {
  enter?: {
    label: string;
    position?: 'start' | 'end' | 'none';
    /** Row index (0-based) where the key appears. Defaults to last row if omitted. */
    row?: number;
  };
  backspace?: {
    label: string;
    position?: 'start' | 'end' | 'none';
    /** Row index (0-based) where the key appears. Defaults to last row if omitted. */
    row?: number;
  };
}

/** Input plugin config: id + optional language-specific config */
export interface InputPluginConfig {
  id: string;
  config?: Record<string, unknown>;
}

interface KeyboardConfig {
  layout: string[][];
  actions?: KeyboardActions;
  /** If true, letters are entered right-to-left (e.g. Hebrew). Defaults to false when missing. */
  rtl?: boolean;
  /** Display name for the language selector menu (e.g. "Español" or "Español (MX)"). */
  menu?: string;
  /** Flag emoji for the language (e.g. "🇪🇸"); shown in selector. */
  flag?: string;
  /** Character normalization mappings (e.g. {"ä": "a", "ß": "ss"}). */
  normalization?: Record<string, string>;
  /** Optional input plugins invoked on every letter entry. */
  plugins?: InputPluginConfig[];
  /** Localized message shown on win. */
  winMessage?: string;
  /** Localized help tip text. */
  helpTip?: string;
  /** Localized lose message template, with {word} placeholder. */
  loseMessage?: string;
  /** About section with localized labels and contributor info. */
  about?: {
    contributorLabel?: string;
    rulesLabel?: string;
    contributor?: string;
  };
}

const keyboardActionsCache = new Map<string, KeyboardActions>();
const keyboardRtlCache = new Map<string, boolean>();
const keyboardMenuCache = new Map<string, string>();
const normalizationCache = new Map<string, Record<string, string>>();
const inputPluginsCache = new Map<string, InputPluginConfig[]>();
const winMessageCache = new Map<string, string>();
const helpTipCache = new Map<string, string>();
const loseMessageCache = new Map<string, string>();
const aboutCache = new Map<string, { contributorLabel?: string; rulesLabel?: string; contributor?: string }>();

/**
 * Locale to directory path (language name + locale). Used for getLanguageDir and discovery.
 * Menu display name comes from each locale's language.json "menu" field.
 */
const LOCALE_PATHS: Record<string, { language: string; locale: string }> = {
  en: { language: 'English', locale: 'en' },
  ru: { language: 'Russian', locale: 'ru' },
  fr: { language: 'French', locale: 'fr' },
  es: { language: 'Spanish', locale: 'es' },
  de: { language: 'German', locale: 'de' },
  he: { language: 'Hebrew', locale: 'he' },
  hy: { language: 'Armenian', locale: 'hy' }, 
};

/**
 * Loads a dictionary file as text with support for comments (#) and empty lines
 */
async function loadDictionaryFile(path: string): Promise<string[]> {
  try {
    const response = await fetch(path);
    
    // Check if file exists (404 means file doesn't exist)
    if (response.status === 404) {
      return [];
    }
    
    // Check if response is OK
    if (!response.ok) {
      return [];
    }
    
    // Check Content-Type to ensure it's a text file, not HTML
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      // File doesn't exist (server returned HTML error page) - silently return empty
      return [];
    }
    
    // If it's a text file, read it
    const text = await response.text();
    const words = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => {
        // Ignore empty lines
        if (!line) return false;
        // Ignore lines starting with #
        if (line.startsWith('#')) return false;
        return true;
      })
      .map(line => {
        // Extract only the first word (up to first whitespace)
        // The rest is considered a comment and not used
        const firstWord = line.split(/\s+/)[0];
        return firstWord.toLowerCase();
      })
      .filter(word => word.length > 0);
    
    console.log(`Loaded ${path}: ${words.length} words`);
    return words;
  } catch (error) {
    // File doesn't exist or error occurred - silently return empty
    return [];
  }
}

/**
 * Fetches menu and flag from a locale's language.json.
 * languageDir is e.g. "Spanish/es". Returns menu (fallback if missing) and optional flag.
 */
async function loadLanguageMeta(
  languageDir: string,
  fallbackName: string
): Promise<{ menu: string; flag?: string }> {
  try {
    const response = await fetch(`${WORD_DATA_BASE}${languageDir}/language.json`);
    if (!response.ok || response.headers.get('content-type')?.includes('text/html')) {
      return { menu: fallbackName };
    }
    const data = await response.json();
    if (!data || typeof data !== 'object') return { menu: fallbackName };
    const menu =
      typeof data.menu === 'string' && data.menu.trim() ? data.menu.trim() : fallbackName;
    const flag = typeof data.flag === 'string' && data.flag.trim() ? data.flag.trim() : undefined;
    return { menu, flag };
  } catch {
    return { menu: fallbackName };
  }
}

/**
 * Detects available languages by scanning the directory structure.
 * Menu display name is read from each locale's language.json "menu" field.
 */
async function discoverLanguages(): Promise<LanguageConfig[]> {
  // Check cache first
  if (languageConfigsCache.size > 0) {
    return Array.from(languageConfigsCache.values());
  }

  const configs: LanguageConfig[] = [];

  console.log('Processing language directories:');
  for (const [locale, info] of Object.entries(LOCALE_PATHS)) {
    const languageDir = `${info.language}/${info.locale}`;
    console.log(`  - Checking directory: ${languageDir}`);

    const possibleLengths = [4, 5, 6, 7, 8, 9, 10];
    const supportedLengths: number[] = [];

    for (const length of possibleLengths) {
      const answerPath = `${DICT_BASE}${languageDir}/answers-${length}.txt`;
      try {
        const response = await fetch(answerPath, { method: 'HEAD' });
        if (response.ok && !response.headers.get('content-type')?.includes('text/html')) {
          supportedLengths.push(length);
        }
      } catch {
        // File doesn't exist
      }
    }

    if (supportedLengths.length > 0) {
      const { menu: name, flag } = await loadLanguageMeta(languageDir, info.language);
      console.log(`    ✓ Found ${languageDir}: ${name}, word lengths [${supportedLengths.join(', ')}]`);

      const config: LanguageConfig = {
        code: locale,
        name,
        flag,
        supportedLengths,
      };
      configs.push(config);
      languageConfigsCache.set(locale, config);
    } else {
      console.log(`    ✗ No answer files found in ${languageDir}`);
    }
  }

  console.log(`Loaded ${configs.length} language(s):`, configs.map(c => `${c.name} (${c.code}): [${c.supportedLengths.join(', ')}]`));
  return configs;
}

/**
 * Gets the directory path for a language/locale
 */
export function getLanguageDir(locale: string): string | null {
  const info = LOCALE_PATHS[locale];
  if (!info) return null;
  return `${info.language}/${info.locale}`;
}

export async function loadWinMessage(language: string): Promise<string | null> {
  if (winMessageCache.has(language)) {
    return winMessageCache.get(language)!;
  }
  await loadKeyboard(language);
  return winMessageCache.get(language) || null;
}

export async function loadHelpTip(language: string): Promise<string | null> {
  if (helpTipCache.has(language)) {
    return helpTipCache.get(language)!;
  }
  await loadKeyboard(language);
  return helpTipCache.get(language) || null;
}

export async function loadLoseMessage(language: string, word: string): Promise<string> {
  if (!loseMessageCache.has(language)) {
    await loadKeyboard(language);
  }
  const template = loseMessageCache.get(language) || 'Answer was: {word}';
  return template.replace('{word}', word);
}

export async function loadAbout(language: string): Promise<{ contributorLabel?: string; rulesLabel?: string; contributor?: string } | null> {
  if (aboutCache.has(language)) {
    return aboutCache.get(language)!;
  }
  await loadKeyboard(language);
  return aboutCache.get(language) || null;
}

/**
 * Loads a dictionary for a specific language and word length
 * Uses the new directory structure: Language/Locale/answers-<len>.txt
 */
export async function loadDictionary(
  language: string,
  wordLength: number
): Promise<DictionaryEntry | null> {
  const cacheKey = `${language}-${wordLength}`;
  
  // Check cache first
  if (dictionaryCache.has(cacheKey)) {
    return dictionaryCache.get(cacheKey)!;
  }

  const languageDir = getLanguageDir(language);
  if (!languageDir) {
    console.warn(`Unknown language code: ${language}`);
    return null;
  }

  // Load answer words and dictionary words from new structure
  const answersPath = `${DICT_BASE}${languageDir}/answers-${wordLength}.txt`;
  const dictionaryPath = `${DICT_BASE}${languageDir}/dictionary-${wordLength}.txt`;

  const [answerWords, allWords] = await Promise.all([
    loadDictionaryFile(answersPath),
    loadDictionaryFile(dictionaryPath),
  ]);

  if (answerWords.length === 0) {
    console.warn(`No answer words found for ${language}-${wordLength}`);
    return null;
  }

  // If dictionary file doesn't exist, use answer words as dictionary
  const combinedWords = allWords.length > 0 
    ? (() => {
        const wordSet = new Set<string>();
        answerWords.forEach(word => wordSet.add(word));
        allWords.forEach(word => wordSet.add(word));
        return Array.from(wordSet).sort();
      })()
    : [...answerWords].sort();

  const sortedAnswerWords = [...answerWords].sort();

  const dictionary: DictionaryEntry = {
    language,
    wordLength,
    words: combinedWords, // All words for validation
    answerWords: sortedAnswerWords, // Sorted answer words for daily word selection
    answerWordsOriginal: answerWords, // Original file order (by frequency)
  };

  // Cache the dictionary
  dictionaryCache.set(cacheKey, dictionary);

  return dictionary;
}

/**
 * Detects available word lengths for a language by checking for answer files
 * Uses the new directory structure
 */
async function detectSupportedLengths(language: string): Promise<number[]> {
  // Check cache first
  if (supportedLengthsCache.has(language)) {
    return supportedLengthsCache.get(language)!;
  }

  const languageDir = getLanguageDir(language);
  if (!languageDir) {
    return [];
  }

  const possibleLengths = [4, 5, 6, 7, 8, 9, 10]; // Check common lengths

  // Check for answer files directly (faster than loading full dictionaries)
  const checkPromises = possibleLengths.map(async (length) => {
    const answerPath = `${DICT_BASE}${languageDir}/answers-${length}.txt`;
    try {
      const response = await fetch(answerPath, { method: 'HEAD' });
      if (response.ok && !response.headers.get('content-type')?.includes('text/html')) {
        return length;
      }
    } catch (error) {
      // File doesn't exist
    }
    return null;
  });

  const results = await Promise.all(checkPromises);
  const lengths = results.filter((length): length is number => length !== null).sort((a, b) => a - b);

  // Cache the result
  supportedLengthsCache.set(language, lengths);

  return lengths;
}

/**
 * Gets all available language configurations with dynamically detected lengths
 * Only returns languages that have at least one answer file
 */
export async function getLanguageConfigs(): Promise<LanguageConfig[]> {
  // Discover languages from directory structure
  const configs = await discoverLanguages();
  
  // Detect supported lengths for each discovered language
  const configsWithLengths = await Promise.all(
    configs.map(async (config) => {
      const supportedLengths = await detectSupportedLengths(config.code);
      return {
        ...config,
        supportedLengths,
      };
    })
  );

  // Filter out languages that don't have any answer files
  return configsWithLengths.filter(config => config.supportedLengths.length > 0);
}

/**
 * Gets a language config by code (synchronous version that may return cached data)
 * For immediate use, call getLanguageConfigs() first to ensure detection is complete
 */
export async function getLanguageConfig(code: string): Promise<LanguageConfig | undefined> {
  const configs = await getLanguageConfigs();
  return configs.find(lang => lang.code === code);
}

/**
 * Loads keyboard layout for a language
 * Supports both old format (2D array) and new format (object with layout and actions)
 */
export async function loadKeyboard(language: string): Promise<string[][] | null> {
  // Use cache only when we have both layout and RTL (so RTL is always in sync with layout)
  if (keyboardCache.has(language) && keyboardRtlCache.has(language)) {
    return keyboardCache.get(language)!;
  }

  const languageDir = getLanguageDir(language);
  if (!languageDir) {
    return null;
  }

  const languagePath = `${WORD_DATA_BASE}${languageDir}/language.json`;

  try {
    const response = await fetch(languagePath, { cache: 'no-store' });

    if (response.status === 404 || !response.ok) {
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      return null;
    }

    const keyboardData = await response.json();

    // Handle object format: { layout: [...], actions?, rtl?, menu? }
    if (keyboardData && typeof keyboardData === 'object' && 'layout' in keyboardData) {
      const config = keyboardData as KeyboardConfig;
      if (Array.isArray(config.layout) && config.layout.every(row => Array.isArray(row))) {
        keyboardCache.set(language, config.layout);
        if (config.actions) {
          keyboardActionsCache.set(language, config.actions);
        }
        keyboardRtlCache.set(language, config.rtl === true);
        if (typeof config.menu === 'string' && config.menu.trim()) {
          keyboardMenuCache.set(language, config.menu.trim());
        }
        if (config.normalization && typeof config.normalization === 'object') {
          normalizationCache.set(language, config.normalization);
        }
        if (typeof config.winMessage === 'string' && config.winMessage.trim()) {
          winMessageCache.set(language, config.winMessage.trim());
        }
        if (typeof config.helpTip === 'string' && config.helpTip.trim()) {
          helpTipCache.set(language, config.helpTip.trim());
        }
        if (typeof config.loseMessage === 'string' && config.loseMessage.trim()) {
          loseMessageCache.set(language, config.loseMessage.trim());
        }
        if (config.about && typeof config.about === 'object') {
          aboutCache.set(language, config.about);
        }
        if (Array.isArray(config.plugins) && config.plugins.length > 0) {
          const valid = config.plugins.filter(
            (p): p is InputPluginConfig => p && typeof p === 'object' && typeof (p as InputPluginConfig).id === 'string'
          );
          inputPluginsCache.set(language, valid);
        } else {
          inputPluginsCache.set(language, []);
        }
        return config.layout;
      }
    }

    // Handle legacy format: 2D array only (default LTR, no menu)
    if (Array.isArray(keyboardData) && keyboardData.every(row => Array.isArray(row))) {
      keyboardCache.set(language, keyboardData);
      keyboardRtlCache.set(language, false);
      inputPluginsCache.set(language, []);
      return keyboardData;
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Returns whether the keyboard for this language uses right-to-left letter entry.
 * Loaded once at startup with the keyboard layout and cached; does not change during the game.
 */
export async function getKeyboardRtl(language: string): Promise<boolean> {
  if (keyboardRtlCache.has(language)) {
    return keyboardRtlCache.get(language)!;
  }
  await loadKeyboard(language);
  return keyboardRtlCache.get(language) ?? false;
}

/**
 * Loads keyboard action buttons configuration for a language
 */
export async function loadKeyboardActions(language: string): Promise<KeyboardActions | null> {
  // Check cache first
  if (keyboardActionsCache.has(language)) {
    return keyboardActionsCache.get(language)!;
  }

  // Try to load keyboard (which will also cache actions if present)
  await loadKeyboard(language);
  
  // Return cached actions or null
  return keyboardActionsCache.get(language) || null;
}

/**
 * Returns the normalization mappings for a language, loaded from language.json.
 * Must be called after loadKeyboard() has been called for this language.
 */
export function getNormalization(language: string): Record<string, string> | null {
  return normalizationCache.get(language) || null;
}

/**
 * Returns the input plugins for a language, loaded from language.json.
 * Must be called after loadKeyboard() has been called for this language.
 */
export function getInputPlugins(language: string): InputPluginConfig[] {
  if (inputPluginsCache.has(language)) {
    return inputPluginsCache.get(language)!;
  }
  return [];
}

/**
 * Preloads all dictionaries (useful for initial load)
 */
export async function preloadAllDictionaries(): Promise<void> {
  const loadPromises: Promise<void>[] = [];
  
  const configs = await getLanguageConfigs();
  for (const langConfig of configs) {
    for (const length of langConfig.supportedLengths) {
      console.log(`Detected lengths for ${langConfig.code}:`, length);
      loadPromises.push(
        loadDictionary(langConfig.code, length).then(() => {})
      );
    }
  }

  await Promise.all(loadPromises);
}
