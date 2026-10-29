const KEY = 'wordaholic-scoreboard';
const PERIODS = ['today', 'week', 'month', 'year', 'lifetime'];

/**
 * @param {unknown} value
 */
function languageList(value) {
  const raw = Array.isArray(value) ? value : [];
  const codes = raw.map((code) => String(code || '').toLowerCase()).filter((code) => /^[a-z]{2,8}$/.test(code));
  return [...new Set(codes)];
}

/**
 * One scoreboard is a single game, the languages to include, and either every
 * parameter combination or one combination. Older rows stored one language and
 * one variant; those become a one-language board with that combination.
 * @param {unknown} raw
 */
function asFavorite(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = /** @type {Record<string, unknown>} */ (raw);
  const game = Number(rec.game);
  const periods = Array.isArray(rec.periods)
    ? rec.periods.filter((period) => PERIODS.includes(String(period)))
    : ['today'];
  if (!Number.isInteger(game) || game < 0 || game > 3) return null;
  const languages = languageList(rec.languages);
  const legacyLanguage = String(rec.language || '').toLowerCase();
  if (!languages.length && /^[a-z]{2,8}$/.test(legacyLanguage)) languages.push(legacyLanguage);
  if (!languages.length) return null;
  let params = 'all';
  if (rec.params === 'all') params = 'all';
  else if (typeof rec.params === 'string' && rec.params) params = rec.params;
  else if (typeof rec.variant === 'string' && rec.variant) {
    params = rec.variant;
    if (game === 3 && rec.board === 'best' && !params.includes('|')) params = `${params}|best`;
  }
  if (params !== 'all' && params.length > 24) return null;
  const weekOf = typeof rec.weekOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rec.weekOf) ? rec.weekOf : '';
  const monthOf = typeof rec.monthOf === 'string' && /^\d{4}-\d{2}$/.test(rec.monthOf) ? rec.monthOf : '';
  const yearNum = Number(rec.yearOf);
  const yearOf = Number.isInteger(yearNum) && yearNum >= 2020 && yearNum <= 2100 ? yearNum : 0;
  return {
    id: typeof rec.id === 'string' && rec.id ? rec.id : crypto.randomUUID(),
    game,
    languages,
    params,
    periods: periods.length ? periods : ['today'],
    weekOf,
    monthOf,
    yearOf,
  };
}

export function loadScoreboardPrefs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
    const limit = Number(parsed.limit);
    const favorites = Array.isArray(parsed.favorites) ? parsed.favorites.map(asFavorite).filter(Boolean) : [];
    return {
      limit: Number.isInteger(limit) && limit >= 1 && limit <= 100 ? limit : 3,
      favorites,
    };
  } catch {
    return { limit: 3, favorites: [] };
  }
}

/**
 * @param {{ limit?: number, favorites?: unknown[] }} prefs
 */
export function saveScoreboardPrefs(prefs) {
  const current = loadScoreboardPrefs();
  const next = {
    limit: prefs.limit == null ? current.limit : prefs.limit,
    favorites: prefs.favorites == null ? current.favorites : prefs.favorites.map(asFavorite).filter(Boolean),
  };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function scoreboardPrefsForBackup() {
  return loadScoreboardPrefs();
}

/**
 * @param {unknown} raw
 */
export function applyScoreboardPrefs(raw) {
  if (!raw || typeof raw !== 'object') return;
  const rec = /** @type {Record<string, unknown>} */ (raw);
  saveScoreboardPrefs({
    limit: Number(rec.limit),
    favorites: Array.isArray(rec.favorites) ? rec.favorites : [],
  });
}
