export const BODY_MAX_BYTES = 8 * 1024;
const MAX_HOME_HITS = 100;
const MAX_KEYS = 32;
const MAX_COUNT = 100;
const LANG_RE = /^[a-z]{2,8}$/;
const POLYWORDLOT_KEY_RE = /^[a-z]{2,8},\d{1,2}$/;
const TRANSWORD_KEY_RE = /^[a-z]{2,8},\d{1,2},\d{1,2}$/;
const KEY_MAX_LEN = 32;

const GAME_KEY_RE = {
  polywordlot: POLYWORDLOT_KEY_RE,
  transword: TRANSWORD_KEY_RE,
};

/**
 * @param {unknown} value
 * @param {RegExp} keyRe
 * @returns {Record<string, number>|null}
 */
function parseCountMap(value, keyRe) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > MAX_KEYS) return null;
  /** @type {Record<string, number>} */
  const out = {};
  for (const [key, raw] of entries) {
    if (typeof key !== 'string' || key.length > KEY_MAX_LEN || !keyRe.test(key)) return null;
    if (!Number.isInteger(raw) || raw < 0 || raw > MAX_COUNT) return null;
    if (raw === 0) continue;
    out[key] = raw;
  }
  return out;
}

/**
 * @param {unknown} body
 * @returns {{ ok: true, delta: {
 *   homeHits?: number,
 *   languages?: Record<string, number>,
 *   games?: { polywordlot?: Record<string, number>, transword?: Record<string, number> },
 * } } | { ok: false }}
 */
export function parseStatsDelta(body) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) return { ok: false };
  /** @type {{
   *   homeHits?: number,
   *   languages?: Record<string, number>,
   *   games?: { polywordlot?: Record<string, number>, transword?: Record<string, number> },
   * }} */
  const delta = {};

  if ('homeHits' in body) {
    const n = /** @type {{ homeHits?: unknown }} */ (body).homeHits;
    if (!Number.isInteger(n) || n < 0 || n > MAX_HOME_HITS) return { ok: false };
    if (n > 0) delta.homeHits = n;
  }

  if ('languages' in body) {
    const languages = parseCountMap(/** @type {{ languages?: unknown }} */ (body).languages, LANG_RE);
    if (!languages) return { ok: false };
    if (Object.keys(languages).length) delta.languages = languages;
  }

  if ('games' in body) {
    const games = /** @type {{ games?: unknown }} */ (body).games;
    if (games == null || typeof games !== 'object' || Array.isArray(games)) return { ok: false };
    /** @type {{ polywordlot?: Record<string, number>, transword?: Record<string, number> }} */
    const outGames = {};
    for (const gameId of Object.keys(games)) {
      if (!(gameId in GAME_KEY_RE)) return { ok: false };
    }
    for (const gameId of /** @type {const} */ (['polywordlot', 'transword'])) {
      if (!(gameId in games)) continue;
      const counts = parseCountMap(games[gameId], GAME_KEY_RE[gameId]);
      if (!counts) return { ok: false };
      if (Object.keys(counts).length) outGames[gameId] = counts;
    }
    if (Object.keys(outGames).length) delta.games = outGames;
  }

  return { ok: true, delta };
}
