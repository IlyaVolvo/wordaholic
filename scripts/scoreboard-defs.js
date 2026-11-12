/**
 * Scoreboard definitions shared by the API, the page, and tests.
 * A game lists definition ids here. Numeric replacements for one game live in
 * GAME_OVERRIDES and win over the shared numbers.
 */

import { inclusiveDays, variantAllowed } from './play-model.js';

export const SCOREBOARD_EARLIEST = '2020-01-01';

/** @type {Record<string, { id: string, title: string, window: { kind: string, days?: number }, qualify: { minGames: number, minShare?: number } }>} */
export const DEFINITIONS = {
  daily: {
    id: 'daily',
    title: 'Daily',
    window: { kind: 'today' },
    qualify: { minGames: 1 },
  },
  'two-week': {
    id: 'two-week',
    title: '2-week average',
    window: { kind: 'rolling', days: 14 },
    qualify: { minGames: 10 },
  },
  'four-week': {
    id: 'four-week',
    title: '4-week average',
    window: { kind: 'rolling', days: 28 },
    qualify: { minGames: 20 },
  },
  lifetime: {
    id: 'lifetime',
    title: 'Lifetime',
    window: { kind: 'since-first' },
    qualify: { minGames: 21, minShare: 0.5 },
  },
};

/**
 * Definition ids each game offers, in display order.
 * @type {Record<number, string[]>}
 */
export const GAME_DEFINITIONS = {
  0: ['two-week', 'four-week', 'lifetime'],
  1: ['daily', 'two-week', 'four-week', 'lifetime'],
  2: ['two-week', 'four-week', 'lifetime'],
  3: ['daily', 'two-week', 'four-week', 'lifetime'],
};

/** @type {Record<string, number>} */
export const GAME_KEY_ID = {
  polywordlot: 0,
  transword: 1,
  polyhydra: 2,
  letterix: 3,
};

/**
 * Per-game replacements. A field set here replaces that field of the shared definition.
 * @type {Record<number, Record<string, { title?: string, window?: { kind?: string, days?: number }, qualify?: { minGames?: number, minShare?: number } }>>}
 */
export const GAME_OVERRIDES = {};

/**
 * @param {string} iso
 * @param {number} count
 */
export function addIsoDays(iso, count) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

/**
 * @param {number} gameId
 * @param {string} definitionId
 */
export function resolveDefinition(gameId, definitionId) {
  const offered = GAME_DEFINITIONS[gameId];
  const base = DEFINITIONS[definitionId];
  if (!offered || !base || !offered.includes(definitionId)) return null;
  const over = GAME_OVERRIDES[gameId]?.[definitionId];
  if (!over) return base;
  return {
    ...base,
    title: typeof over.title === 'string' && over.title ? over.title : base.title,
    window: { ...base.window, ...(over.window || {}) },
    qualify: { ...base.qualify, ...(over.qualify || {}) },
  };
}

/**
 * @param {number} gameId
 */
export function definitionsForGame(gameId) {
  const ids = GAME_DEFINITIONS[gameId] || [];
  return ids.map((id) => resolveDefinition(gameId, id)).filter(Boolean);
}

/**
 * @param {string} key
 */
export function gameIdForKey(key) {
  const id = GAME_KEY_ID[key];
  return Number.isInteger(id) ? id : null;
}

/**
 * @param {{ qualify: { minGames: number, minShare?: number }, window: { kind: string, days?: number } }} definition
 */
export function qualificationLine(definition) {
  const games = definition.qualify.minGames;
  const gameWord = games === 1 ? 'game' : 'games';
  if (definition.window.kind === 'today') return `At least ${games} ${gameWord} today.`;
  if (definition.window.kind === 'rolling') {
    return `At least ${games} ${gameWord} in the last ${definition.window.days} days.`;
  }
  const share = definition.qualify.minShare;
  const shareText = share === 0.5 ? 'half' : `${Math.round((share || 0) * 100)}% of`;
  return `At least ${games} ${gameWord}, and at least ${shareText} the days since the first game.`;
}

/**
 * @param {{ window: { kind: string, days?: number } }} definition
 * @param {string} today
 */
export function windowFor(definition, today) {
  if (definition.window.kind === 'today') return { from: today, to: today };
  if (definition.window.kind === 'rolling') {
    const days = definition.window.days || 1;
    return { from: addIsoDays(today, -(days - 1)), to: today };
  }
  return { from: SCOREBOARD_EARLIEST, to: today };
}

/**
 * Letterix configurations are `width,height|average` or `width,height|best`.
 * Other games use the stored variant as the configuration id.
 * @param {number} gameId
 * @param {string} configuration
 * @returns {{ variant: string, aggregate: 'average' | 'best' } | null}
 */
export function parseConfiguration(gameId, configuration) {
  if (typeof configuration !== 'string' || !configuration || configuration.length > 24) return null;
  if (gameId === 3) {
    const match = /^(\d{1,2},\d{1,2})\|(average|best)$/.exec(configuration);
    if (!match || !variantAllowed(3, match[1])) return null;
    return { variant: match[1], aggregate: match[2] === 'best' ? 'best' : 'average' };
  }
  if (!variantAllowed(gameId, configuration)) return null;
  return { variant: configuration, aggregate: 'average' };
}

/**
 * Earliest finish per player and puzzle date. A finish with loss_reason set drops that puzzle.
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
 */
export function tallyFinishes(finishes, gameId) {
  const ordered = [...finishes].sort(
    (a, b) => a.finishedAt - b.finishedAt || String(a.browserId).localeCompare(String(b.browserId))
  );
  /** @type {Map<string, (typeof ordered)[number]>} */
  const earliest = new Map();
  for (const row of ordered) {
    const key = `${row.nameKey}\t${row.puzzleDate}`;
    if (!earliest.has(key)) earliest.set(key, row);
  }
  /** @type {Map<string, { nickname: string, nameKey: string, days: { date: string, value: number }[] }>} */
  const byNick = new Map();
  for (const row of earliest.values()) {
    if (row.lossReason != null) continue;
    let slot = byNick.get(row.nameKey);
    if (!slot) {
      slot = { nickname: row.nickname, nameKey: row.nameKey, days: [] };
      byNick.set(row.nameKey, slot);
    }
    slot.days.push({ date: row.puzzleDate, value: row.rankValue });
  }
  for (const slot of byNick.values()) slot.days.sort((a, b) => a.date.localeCompare(b.date));
  return [...byNick.values()];
}

/**
 * @param {{ nickname: string, nameKey: string, days: { date: string, value: number }[] }[]} players
 * @param {{ window: { kind: string }, qualify: { minGames: number, minShare?: number } }} definition
 * @param {string} today
 * @param {'average' | 'best'} aggregate
 */
export function scoreDefined(players, definition, today, aggregate) {
  /** @type {{ nickname: string, nameKey: string, puzzles: number, value: number }[]} */
  const rows = [];
  for (const player of players) {
    const days = player.days;
    const puzzles = days.length;
    if (puzzles < definition.qualify.minGames) continue;
    if (definition.window.kind === 'since-first' && definition.qualify.minShare != null) {
      const span = inclusiveDays(days[0].date, today);
      const need = Math.ceil(span * definition.qualify.minShare);
      if (puzzles < need) continue;
    }
    const values = days.map((day) => day.value);
    const value =
      aggregate === 'best' ? Math.max(...values) : values.reduce((sum, n) => sum + n, 0) / values.length;
    rows.push({ nickname: player.nickname, nameKey: player.nameKey, puzzles, value });
  }
  return rows;
}
