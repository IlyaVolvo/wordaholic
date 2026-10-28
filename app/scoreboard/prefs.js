const KEY = 'wordaholic-scoreboard';
const PERIODS = ['today', 'week', 'month', 'year', 'lifetime'];

/**
 * @param {unknown} raw
 */
function asFavorite(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = /** @type {Record<string, unknown>} */ (raw);
  const game = Number(rec.game);
  const language = String(rec.language || '').toLowerCase();
  const variant = String(rec.variant || '');
  const board = rec.board === 'best' ? 'best' : 'average';
  const periods = Array.isArray(rec.periods)
    ? rec.periods.filter((period) => PERIODS.includes(String(period)))
    : ['today'];
  if (!Number.isInteger(game) || game < 0 || game > 3) return null;
  if (!/^[a-z]{2,8}$/.test(language) || !variant) return null;
  return {
    id: typeof rec.id === 'string' && rec.id ? rec.id : crypto.randomUUID(),
    game,
    language,
    variant,
    board: game === 3 ? board : 'average',
    periods: periods.length ? periods : ['today'],
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
