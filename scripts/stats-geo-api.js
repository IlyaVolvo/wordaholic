/**
 * Shared JSON body for GET /api/stats/geo.
 */
import { combineGeoLocalities, parseDateRange } from './stats-combine.js';
import { STATS_GAME_IDS } from './stats-games.js';
import { lookupGeo } from './stats-geo-lookup.js';

/**
 * Fill missing country/city on raw hour records (archives often lack CF geo).
 * Mutates `inputs` bodies in place; returns newly resolved geos by IP key used in the body.
 *
 * @param {{ source: string, body: unknown }[]} inputs
 * @param {{ from?: string | null, toExclusive?: string | null }} [range]
 * @returns {Promise<Map<string, import('./stats-combine.js').StatsGeo>>}
 */
export async function enrichInputsWithLookedUpGeo(inputs, range = {}) {
  /** @type {Map<string, import('./stats-combine.js').StatsGeo | null>} */
  const cache = new Map();
  /** @type {Map<string, import('./stats-combine.js').StatsGeo>} */
  const found = new Map();

  /** @type {string[]} */
  const need = [];
  for (const { body } of inputs || []) {
    if (!body || typeof body !== 'object') continue;
    const hours = /** @type {{ hours?: unknown }} */ (body).hours;
    if (!Array.isArray(hours)) continue;
    for (const bucket of hours) {
      if (!bucket || typeof bucket !== 'object') continue;
      const hour = String(/** @type {{ hour?: unknown }} */ (bucket).hour || '');
      if (!hour) continue;
      if (range.from && hour < range.from) continue;
      if (range.toExclusive && hour >= range.toExclusive) continue;
      const ips = /** @type {{ ips?: Record<string, { geo?: { country?: string } }> }} */ (bucket).ips;
      if (!ips || typeof ips !== 'object') continue;
      for (const [ip, rec] of Object.entries(ips)) {
        if (!ip || !rec) continue;
        if (rec.geo && rec.geo.country) continue;
        if (!cache.has(ip)) {
          cache.set(ip, null);
          need.push(ip);
        }
      }
    }
  }

  await Promise.all(
    need.map(async (ip) => {
      const geo = await lookupGeo(ip);
      cache.set(ip, geo);
      if (geo) found.set(ip, geo);
    })
  );

  if (!found.size) return found;

  for (const { body } of inputs || []) {
    if (!body || typeof body !== 'object') continue;
    const hours = /** @type {{ hours?: { ips?: Record<string, { geo?: unknown }> }[] }} */ (body).hours;
    if (!Array.isArray(hours)) continue;
    for (const bucket of hours) {
      const ips = bucket?.ips;
      if (!ips || typeof ips !== 'object') continue;
      for (const [ip, rec] of Object.entries(ips)) {
        if (!rec || (rec.geo && /** @type {{ country?: string }} */ (rec.geo).country)) continue;
        const geo = cache.get(ip);
        if (geo) rec.geo = { ...geo };
      }
    }
  }

  return found;
}

/**
 * @param {{ source: string, body: unknown }[]} inputs
 * @param {string} [from]
 * @param {string} [to]
 */
export async function buildStatsGeoPayload(inputs, from = '', to = '') {
  const range = parseDateRange(from || '', to || '');
  await enrichInputsWithLookedUpGeo(inputs, range);
  const { localities, total } = combineGeoLocalities(inputs, range);
  return {
    from: from || '',
    to: to || '',
    total,
    games: STATS_GAME_IDS.slice(),
    localities,
  };
}
