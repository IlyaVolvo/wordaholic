/**
 * Turn daily SQLite rows into the hour documents the operator page already reads.
 * A day is stored as midnight UTC. Days before the cutover use the frozen table.
 * On and after the cutover, game counts come from plays and home/language from live rows.
 */
import { pickRicherGeo } from './stats-combine.js';
import { playGame } from './play-model.js';

/**
 * @param {Record<string, number>} into
 * @param {Record<string, number>} extra
 */
function addCounts(into, extra) {
  for (const [key, raw] of Object.entries(extra || {})) {
    const n = Number(raw) || 0;
    if (!key || n <= 0) continue;
    into[key] = (into[key] || 0) + n;
  }
}

/**
 * @param {{
 *   frozen: { ip: string, day: string, homeHits: number, languages: Record<string, number>, games: Record<string, Record<string, number>>, geo: { country?: string, region?: string, city?: string, asOrg?: string } | null }[],
 *   live: { ip: string, day: string, homeHits: number, languages: Record<string, number>, geo: { country?: string, region?: string, city?: string, asOrg?: string } | null }[],
 *   plays: { ip: string, day: string, gameId: number, language: string, variant: string, n: number }[],
 *   cutover: string | null,
 * }} source
 * @returns {{ source: string, body: { hours: { hour: string, ips: Record<string, unknown> }[] } }[]}
 */
export function statsInputsFromTables(source) {
  /** @type {Map<string, { ip: string, day: string, homeHits: number, languages: Record<string, number>, games: Record<string, Record<string, number>>, geo: ReturnType<typeof pickRicherGeo> }>} */
  const slots = new Map();
  const slot = (ip, day) => {
    const key = `${ip}\t${day}`;
    let row = slots.get(key);
    if (!row) {
      row = { ip, day, homeHits: 0, languages: {}, games: {}, geo: null };
      slots.set(key, row);
    }
    return row;
  };

  for (const row of source.frozen || []) {
    if (source.cutover && row.day >= source.cutover) continue;
    const into = slot(row.ip, row.day);
    into.homeHits += row.homeHits || 0;
    addCounts(into.languages, row.languages);
    for (const [gameId, counts] of Object.entries(row.games || {})) {
      if (!into.games[gameId]) into.games[gameId] = {};
      addCounts(into.games[gameId], counts);
    }
    into.geo = pickRicherGeo(into.geo, row.geo);
  }

  for (const row of source.live || []) {
    if (source.cutover && row.day < source.cutover) continue;
    const into = slot(row.ip, row.day);
    into.homeHits += row.homeHits || 0;
    addCounts(into.languages, row.languages);
    into.geo = pickRicherGeo(into.geo, row.geo);
  }

  for (const row of source.plays || []) {
    if (!row.ip || !row.day) continue;
    if (source.cutover && row.day < source.cutover) continue;
    const game = playGame(row.gameId);
    if (!game || !row.n) continue;
    const into = slot(row.ip, row.day);
    if (!into.games[game.key]) into.games[game.key] = {};
    const perm = `${row.language},${row.variant}`;
    into.games[game.key][perm] = (into.games[game.key][perm] || 0) + row.n;
  }

  /** @type {Map<string, Record<string, unknown>>} */
  const byDay = new Map();
  for (const row of slots.values()) {
    let ips = byDay.get(row.day);
    if (!ips) {
      ips = {};
      byDay.set(row.day, ips);
    }
    ips[row.ip] = {
      homeHits: row.homeHits,
      languages: row.languages,
      games: row.games,
      geo: row.geo || undefined,
    };
  }

  const hours = [...byDay.keys()].sort().map((day) => ({
    hour: `${day}T00:00:00.000Z`,
    ips: byDay.get(day) || {},
  }));
  return [{ source: 'sqlite', body: { hours } }];
}
