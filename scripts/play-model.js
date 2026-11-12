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
 * NULL is a ranked win. Any other integer is a stored finish the scoreboard drops.
 * PolyWordlot is the guesses used. Transword is the hint count, and 0 is stored as NULL.
 * PolyHydra is the guesses used when the loss was detected. Letterix rejects a number.
 * @param {number} gameId
 * @param {string} variant
 * @param {unknown} lossReason
 * @returns {{ ok: true, lossReason: number | null } | { ok: false }}
 */
function parseLossReason(gameId, variant, lossReason) {
  if (lossReason == null) return { ok: true, lossReason: null };
  if (!Number.isInteger(lossReason)) return { ok: false };
  if (gameId === 0) {
    if (lossReason < 1 || lossReason > 6) return { ok: false };
    return { ok: true, lossReason };
  }
  if (gameId === 1) {
    if (lossReason === 0) return { ok: true, lossReason: null };
    if (lossReason < 1 || lossReason > MAX_HELP) return { ok: false };
    return { ok: true, lossReason };
  }
  if (gameId === 2) {
    const boards = Number(String(variant).split(',')[1]);
    const max = boards + 5;
    if (lossReason < 1 || lossReason > max) return { ok: false };
    return { ok: true, lossReason };
  }
  return { ok: false };
}

/**
 * @param {number} gameId
 * @param {string} variant
 * @param {unknown} value
 * @param {unknown} lossReason
 * @returns {{ ok: true, value: number, lossReason: number | null } | { ok: false }}
 */
export function parseResult(gameId, variant, value, lossReason) {
  if (!Number.isInteger(value)) return { ok: false };
  const reason = parseLossReason(gameId, variant, lossReason);
  if (!reason.ok) return { ok: false };
  if (gameId === 0) {
    if (value < 1 || value > 6) return { ok: false };
    return { ok: true, value, lossReason: reason.lossReason };
  }
  if (gameId === 2) {
    const boards = Number(String(variant).split(',')[1]);
    if (!Number.isInteger(boards) || boards < 2 || boards > 20) return { ok: false };
    const max = boards + 5;
    if (value < 1 || value > max) return { ok: false };
    return { ok: true, value, lossReason: reason.lossReason };
  }
  if (gameId === 1) {
    if (value < 0 || value > MAX_TIME_MS) return { ok: false };
    return { ok: true, value, lossReason: reason.lossReason };
  }
  if (gameId === 3) {
    if (value < 0 || value > MAX_POINTS) return { ok: false };
    return { ok: true, value, lossReason: null };
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
 *   lossReason: number | null,
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
        lossReason: null,
      },
    };
  }
  const result = parseResult(/** @type {number} */ (gameId), variant, rec.value, rec.lossReason);
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
      lossReason: result.lossReason,
    },
  };
}

/**
 * Earliest finish per nickname and puzzle. A finish with loss_reason set drops
 * that puzzle. Average, or the highest points when the board is best.
 * @param {{
 *   nickname: string,
 *   nameKey: string,
 *   puzzleDate: string,
 *   rankValue: number,
 *   lossReason: number | null,
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
    if (row.lossReason != null) continue;
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

/** Calendar days in a from/to pair, both inclusive. */
export function inclusiveDays(from, to) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 86400000) + 1;
}

/** Smallest puzzle count that is at least half the days in the period. */
export function minimumShare(days) {
  return Math.ceil(Math.max(0, days) / 2);
}

export const LIFETIME_GAMES = 50;

/**
 * Week, month, and year boards keep players who finished at least half the
 * games in the range. Lifetime keeps players with at least 50 games.
 * @param {{ puzzles: number }[]} rows
 * @param {string} from
 * @param {string} to
 * @param {'share' | 'lifetime' | ''} gate
 */
export function qualifyBoard(rows, from, to, gate) {
  if (gate === 'lifetime') return rows.filter((row) => row.puzzles >= LIFETIME_GAMES);
  if (gate === 'share') {
    const need = minimumShare(inclusiveDays(from, to));
    return rows.filter((row) => row.puzzles >= need);
  }
  return rows;
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
