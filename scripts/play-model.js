/**
 * Scoreboard games, report checks, and ranking. Shared by the Worker and tests.
 * Game numbers stay fixed: a new game takes the next number.
 */

export const PLAY_GAMES = [
  { id: 0, key: 'polywordlot', lowerBetter: true, boards: ['average'] },
  { id: 1, key: 'transword', lowerBetter: true, boards: ['average'] },
  { id: 2, key: 'polyhydra', lowerBetter: true, boards: ['average'] },
  { id: 3, key: 'letterix', lowerBetter: false, boards: ['average', 'best'] },
];

const BY_ID = new Map(PLAY_GAMES.map((game) => [game.id, game]));
const BY_KEY = new Map(PLAY_GAMES.map((game) => [game.key, game]));

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const LANG_RE = /^[a-z]{2,8}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NICK_RE = /^[A-Za-z0-9]{3,16}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const EARLIEST_DAY = '2020-01-01';
const MAX_TIME_MS = 7 * DAY_MS;
const MAX_HELP = 500;
const MAX_POINTS = 1_000_000;

/**
 * @param {number} id
 */
export function playGame(id) {
  return BY_ID.get(id) || null;
}

/**
 * @param {string} key
 */
export function playGameByKey(key) {
  return BY_KEY.get(key) || null;
}

/**
 * @param {unknown} raw
 * @returns {{ display: string, nameKey: string } | null}
 */
export function parseNickname(raw) {
  const display = String(raw ?? '').trim();
  if (!NICK_RE.test(display)) return null;
  return { display, nameKey: display.toLowerCase() };
}

/**
 * @param {string} display
 * @param {(nameKey: string) => boolean} taken
 * @returns {string[]}
 */
export function suffixSuggestions(display, taken) {
  /** @type {string[]} */
  const out = [];
  const base = String(display || '').replace(/[0-9]+$/, '') || String(display || '');
  for (let n = 2; n <= 99 && out.length < 3; n += 1) {
    const suffix = String(n);
    const trimmed = base.slice(0, 16 - suffix.length);
    const candidate = `${trimmed}${suffix}`;
    if (!parseNickname(candidate)) continue;
    if (taken(candidate.toLowerCase())) continue;
    out.push(candidate);
  }
  return out;
}

/**
 * @param {unknown} raw
 */
export function parseBrowserId(raw) {
  const id = String(raw || '').trim().toLowerCase();
  return UUID_RE.test(id) ? id : '';
}

/**
 * @param {number} now
 */
export function latestPuzzleDate(now) {
  return new Date(now + DAY_MS).toISOString().slice(0, 10);
}

/**
 * @param {string} date
 * @param {number} now
 */
export function puzzleDateAllowed(date, now) {
  return DAY_RE.test(date) && date >= EARLIEST_DAY && date <= latestPuzzleDate(now);
}

/**
 * A device time more than a day ahead of the server is stored as the server's time.
 * @param {unknown} raw
 * @param {number} now
 */
export function clampClientTime(raw, now) {
  const t = Number(raw);
  if (!Number.isFinite(t)) return now;
  const ms = Math.trunc(t);
  if (ms > now + DAY_MS) return now;
  return ms;
}

/**
 * @param {number} gameId
 * @param {string} variant
 * @param {unknown} value
 * @param {unknown} helpCount
 * @returns {{ ok: true, value: number, helpCount: number | null } | { ok: false }}
 */
export function parseResult(gameId, variant, value, helpCount) {
  if (!Number.isInteger(value)) return { ok: false };
  if (gameId === 0) {
    if (value < 1 || value > 6) return { ok: false };
    return { ok: true, value, helpCount: null };
  }
  if (gameId === 2) {
    const boards = Number(String(variant).split(',')[1]);
    if (!Number.isInteger(boards) || boards < 2 || boards > 20) return { ok: false };
    const max = boards + 5;
    if (value < 1 || value > max) return { ok: false };
    return { ok: true, value, helpCount: null };
  }
  if (gameId === 1) {
    const help = helpCount == null ? 0 : helpCount;
    if (!Number.isInteger(help) || help < 0 || help > MAX_HELP) return { ok: false };
    if (value < 0 || value > MAX_TIME_MS) return { ok: false };
    return { ok: true, value, helpCount: help };
  }
  if (gameId === 3) {
    if (value < 0 || value > MAX_POINTS) return { ok: false };
    return { ok: true, value, helpCount: null };
  }
  return { ok: false };
}

/**
 * @param {string} variant
 * @param {number} gameId
 */
export function variantAllowed(gameId, variant) {
  if (typeof variant !== 'string' || variant.length > 16) return false;
  if (gameId === 0) return /^\d{1,2}$/.test(variant);
  if (gameId === 1 || gameId === 3) return /^\d{1,2},\d{1,2}$/.test(variant);
  if (gameId === 2) {
    const match = /^(\d{1,2}),(\d{1,2})$/.exec(variant);
    if (!match) return false;
    const boards = Number(match[2]);
    return boards >= 2 && boards <= 20;
  }
  return false;
}

/**
 * @param {unknown} raw
 * @param {number} now
 * @returns {{ ok: true, report: {
 *   browserId: string,
 *   gameId: number,
 *   puzzleDate: string,
 *   language: string,
 *   variant: string,
 *   kind: 'start' | 'end',
 *   clientTime: number,
 *   value: number | null,
 *   helpCount: number | null,
 * } } | { ok: false }}
 */
export function parsePlayReport(raw, now) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false };
  const rec = /** @type {Record<string, unknown>} */ (raw);
  const browserId = parseBrowserId(rec.browserId);
  const gameId = rec.gameId;
  if (!browserId || !Number.isInteger(gameId) || !playGame(/** @type {number} */ (gameId))) return { ok: false };
  const language = String(rec.language || '').trim().toLowerCase();
  const variant = String(rec.variant || '');
  const puzzleDate = String(rec.puzzleDate || '');
  const kind = rec.kind;
  if (!LANG_RE.test(language) || !variantAllowed(/** @type {number} */ (gameId), variant)) return { ok: false };
  if (!puzzleDateAllowed(puzzleDate, now)) return { ok: false };
  if (kind !== 'start' && kind !== 'end') return { ok: false };
  const clientTime = clampClientTime(rec.clientTime, now);
  if (kind === 'start') {
    return {
      ok: true,
      report: {
        browserId,
        gameId: /** @type {number} */ (gameId),
        puzzleDate,
        language,
        variant,
        kind,
        clientTime,
        value: null,
        helpCount: null,
      },
    };
  }
  const result = parseResult(/** @type {number} */ (gameId), variant, rec.value, rec.helpCount);
  if (!result.ok) return { ok: false };
  return {
    ok: true,
    report: {
      browserId,
      gameId: /** @type {number} */ (gameId),
      puzzleDate,
      language,
      variant,
      kind,
      clientTime,
      value: result.value,
      helpCount: result.helpCount,
    },
  };
}

/**
 * Earliest finish per nickname and puzzle. A helped Transword earliest finish
 * drops that puzzle. Average, or the highest points when the board is best.
 * @param {{
 *   nickname: string,
 *   nameKey: string,
 *   puzzleDate: string,
 *   rankValue: number,
 *   helpCount: number | null,
 *   finishedAt: number,
 *   browserId: string,
 * }[]} finishes
 * @param {number} gameId
 * @param {'average' | 'best'} board
 */
export function aggregateBoard(finishes, gameId, board) {
  const ordered = [...finishes].sort(
    (a, b) => a.finishedAt - b.finishedAt || String(a.browserId).localeCompare(String(b.browserId))
  );
  /** @type {Map<string, (typeof ordered)[number]>} */
  const earliest = new Map();
  for (const row of ordered) {
    const key = `${row.nameKey}\t${row.puzzleDate}`;
    if (!earliest.has(key)) earliest.set(key, row);
  }
  /** @type {Map<string, { nickname: string, nameKey: string, values: number[] }>} */
  const byNick = new Map();
  for (const row of earliest.values()) {
    if (gameId === 1 && (row.helpCount || 0) > 0) continue;
    let slot = byNick.get(row.nameKey);
    if (!slot) {
      slot = { nickname: row.nickname, nameKey: row.nameKey, values: [] };
      byNick.set(row.nameKey, slot);
    }
    slot.values.push(row.rankValue);
  }
  return [...byNick.values()].map((slot) => ({
    nickname: slot.nickname,
    nameKey: slot.nameKey,
    puzzles: slot.values.length,
    value:
      board === 'best'
        ? Math.max(...slot.values)
        : slot.values.reduce((sum, n) => sum + n, 0) / slot.values.length,
  }));
}

/**
 * Tied values share a place. The next place skips by the size of the tie.
 * The top group is a count of nicknames. The viewer's row is extra when they fall outside it.
 * @param {{ nickname: string, nameKey: string, puzzles: number, value: number }[]} rows
 * @param {{ lowerBetter: boolean, limit: number, selfKey?: string }} opts
 */
export function rankBoard(rows, opts) {
  const limit = Math.min(100, Math.max(1, Math.trunc(opts.limit) || 3));
  const sorted = [...rows].sort((a, b) => {
    if (a.value !== b.value) return opts.lowerBetter ? a.value - b.value : b.value - a.value;
    return a.nickname.localeCompare(b.nickname, 'en', { sensitivity: 'base' });
  });
  let place = 1;
  const ranked = sorted.map((row, index) => {
    if (index > 0 && row.value !== sorted[index - 1].value) place = index + 1;
    return {
      place,
      nickname: row.nickname,
      nameKey: row.nameKey,
      value: row.value,
      puzzles: row.puzzles,
    };
  });
  const top = ranked.slice(0, limit).map(({ nameKey: _nameKey, ...row }) => row);
  const selfIndex = opts.selfKey ? ranked.findIndex((row) => row.nameKey === opts.selfKey) : -1;
  const outside = selfIndex >= limit ? ranked[selfIndex] : null;
  const self = outside
    ? { place: outside.place, nickname: outside.nickname, value: outside.value, puzzles: outside.puzzles }
    : null;
  return { top, self };
}
