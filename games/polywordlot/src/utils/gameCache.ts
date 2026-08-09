import { formatDate } from './dailyWord';

interface CachedGame {
  id: number;
  language: string;
  word_length: number;
  target_word: string;
  game_date: string;
  is_random_mode: number;
  word_seed: number | null;
  is_complete: number;
  guesses: Array<{ word: string; evaluations: any[] }>;
  isWon: boolean;
  guessesCount: number;
  created_at: string | null;
  completed_at: string | null;
}

interface GameCache {
  [key: string]: {
    games: Record<string, CachedGame>;
    lastUpdated: number;
    dateRange: { start: string; end: string };
  };
}

// Cache key format: language_wordLength
const getCacheKey = (language: string, wordLength: number): string => {
  return `${language}_${wordLength}`;
};

// Calculate date range for last 30 days
const getDateRange = (): { start: string; end: string } => {
  const today = new Date();
  const endDate = formatDate(today);
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - 29); // 30 days including today
  return {
    start: formatDate(startDate),
    end: endDate,
  };
};

// Check if a date is within the cached range
const isDateInRange = (date: string, range: { start: string; end: string }): boolean => {
  return date >= range.start && date <= range.end;
};

// In-memory cache (persists during session)
const gameCache: GameCache = {};

export const gameCacheUtils = {
  // Get cached game for a specific date
  getCachedGame(language: string, wordLength: number, date: string): CachedGame | null {
    const key = getCacheKey(language, wordLength);
    const cache = gameCache[key];
    
    if (!cache) return null;
    
    // Check if date is in cached range
    if (!isDateInRange(date, cache.dateRange)) {
      return null;
    }
    
    // Check if cache is stale (older than 5 minutes)
    const now = Date.now();
    if (now - cache.lastUpdated > 5 * 60 * 1000) {
      return null;
    }
    
    return cache.games[date] || null;
  },

  // Set cached games for a date range
  setCachedGames(language: string, wordLength: number, games: Record<string, CachedGame>, dateRange: { start: string; end: string }): void {
    const key = getCacheKey(language, wordLength);
    gameCache[key] = {
      games,
      lastUpdated: Date.now(),
      dateRange,
    };
  },

  // Update a single game in cache
  updateCachedGame(language: string, wordLength: number, date: string, game: CachedGame): void {
    const key = getCacheKey(language, wordLength);
    const cache = gameCache[key];
    
    if (cache && isDateInRange(date, cache.dateRange)) {
      cache.games[date] = game;
      cache.lastUpdated = Date.now();
    }
  },

  // Check if cache exists and is valid for a date range
  hasValidCache(language: string, wordLength: number, dateRange: { start: string; end: string }): boolean {
    const key = getCacheKey(language, wordLength);
    const cache = gameCache[key];
    
    if (!cache) return false;
    
    // Check if cache covers the requested range
    if (cache.dateRange.start > dateRange.start || cache.dateRange.end < dateRange.end) {
      return false;
    }
    
    // Check if cache is stale (older than 5 minutes)
    const now = Date.now();
    if (now - cache.lastUpdated > 5 * 60 * 1000) {
      return false;
    }
    
    return true;
  },

  // Get the default date range (last 30 days)
  getDefaultDateRange(): { start: string; end: string } {
    return getDateRange();
  },

  // Clear cache for a specific language/wordLength combination
  clearCache(language: string, wordLength: number): void {
    const key = getCacheKey(language, wordLength);
    delete gameCache[key];
  },

  // Clear all cache
  clearAllCache(): void {
    Object.keys(gameCache).forEach(key => delete gameCache[key]);
  },
};
