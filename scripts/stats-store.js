import { ipIdentity, normalizeGeo, pickRicherGeo } from './stats-combine.js';
import { STATS_GAME_IDS } from './stats-games.js';

const HOUR_MS = 60 * 60 * 1000;
export const RETAIN_MS = 24 * HOUR_MS;
export const PRUNE_INTERVAL_MS = 10 * 60 * 1000;

/**
 * UTC hour truncated to the hour, e.g. 2026-08-27T14:00:00.000Z.
 * @param {number} [now]
 */
export function hourIso(now = Date.now()) {
  const d = new Date(now);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCMilliseconds(0);
  return d.toISOString();
}

/**
 * @returns {Record<string, Record<string, number>>}
 */
function emptyGames() {
  /** @type {Record<string, Record<string, number>>} */
  const games = {};
  for (const id of STATS_GAME_IDS) games[id] = {};
  return games;
}

/**
 * @param {Record<string, unknown>} source
 * @returns {Record<string, Record<string, number>>}
 */
function copyRegisteredGames(source) {
  /** @type {Record<string, Record<string, number>>} */
  const games = {};
  for (const id of STATS_GAME_IDS) {
    const src = source[id];
    games[id] = src && typeof src === 'object' && !Array.isArray(src) ? { ...src } : {};
  }
  return games;
}

function emptyRecord() {
  return {
    homeHits: 0,
    languages: /** @type {Record<string, number>} */ ({}),
    games: emptyGames(),
    geo: /** @type {import('./stats-combine.js').StatsGeo | null} */ (null),
  };
}

/**
 * @param {Record<string, number>} target
 * @param {Record<string, number>} source
 */
function mergeCounts(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (!value) continue;
    target[key] = (target[key] || 0) + value;
  }
}

/**
 * @param {Map<string, ReturnType<typeof emptyRecord>>} byIp
 */
/**
 * @param {Map<string, ReturnType<typeof emptyRecord>>} byIp
 * @param {Map<string, import('./stats-combine.js').StatsGeo>} geoByIp
 */
function serializeIps(byIp, geoByIp) {
  /** @type {Record<string, {
   *   homeHits: number,
   *   languages: Record<string, number>,
   *   games: Record<string, Record<string, number>>,
   * }>} */
  const ips = {};
  for (const [ip, rec] of byIp) {
    /** @type {{
     *   homeHits: number,
     *   languages: Record<string, number>,
     *   games: Record<string, Record<string, number>>,
     *   geo?: import('./stats-combine.js').StatsGeo,
     * }} */
    const out = {
      homeHits: rec.homeHits,
      languages: { ...rec.languages },
      games: copyRegisteredGames(rec.games),
    };
    const geo = rec.geo || geoByIp.get(ipIdentity(ip)) || null;
    if (geo) out.geo = { ...geo };
    ips[ip] = out;
  }
  return ips;
}

/**
 * In-memory UTC hourly buckets keyed by IP.
 * @param {{ retainMs?: number, requireArchivedForPrune?: boolean }} [opts]
 */
export function createStatsStore(opts = {}) {
  const retainMs = opts.retainMs ?? RETAIN_MS;
  const requireArchivedForPrune = Boolean(opts.requireArchivedForPrune);
  /** @type {Map<string, Map<string, ReturnType<typeof emptyRecord>>>} */
  const hours = new Map();
  /** @type {Set<string>} */
  const archived = new Set();
  /** @type {Map<string, import('./stats-combine.js').StatsGeo>} */
  const geoByIp = new Map();

  /**
   * @param {number} [now]
   * @param {{ requireArchived?: boolean }} [pruneOpts]
   */
  function prune(now = Date.now(), pruneOpts = {}) {
    const requireArchived = pruneOpts.requireArchived ?? requireArchivedForPrune;
    const cutoff = hourIso(now - retainMs);
    for (const key of hours.keys()) {
      if (key >= cutoff) continue;
      if (requireArchived && !archived.has(key)) continue;
      hours.delete(key);
      archived.delete(key);
    }
  }

  /**
   * @param {string} ip
   * @param {{
   *   homeHits?: number,
   *   languages?: Record<string, number>,
   *   games?: Record<string, Record<string, number>>,
   * }} delta
   * @param {number} [now]
   * @param {import('./stats-combine.js').StatsGeo | null} [geo]
   */
  function merge(ip, delta, now = Date.now(), geo = null) {
    prune(now);
    const hour = hourIso(now);
    let byIp = hours.get(hour);
    if (!byIp) {
      byIp = new Map();
      hours.set(hour, byIp);
    }
    let rec = byIp.get(ip);
    if (!rec) {
      rec = emptyRecord();
      byIp.set(ip, rec);
    }
    if (delta.homeHits) rec.homeHits += delta.homeHits;
    if (delta.languages) mergeCounts(rec.languages, delta.languages);
    if (delta.games) {
      for (const id of STATS_GAME_IDS) {
        if (delta.games[id]) mergeCounts(rec.games[id], delta.games[id]);
      }
    }
    rec.geo = pickRicherGeo(rec.geo, normalizeGeo(geo));
    rememberGeo(ip, rec.geo);
  }

  /**
   * @param {string} ip
   * @param {import('./stats-combine.js').StatsGeo | null | undefined} geo
   */
  function rememberGeo(ip, geo) {
    const normalized = normalizeGeo(geo);
    if (!normalized) return;
    const id = ipIdentity(ip);
    geoByIp.set(id, pickRicherGeo(geoByIp.get(id), normalized));
  }

  /**
   * Last 24h for GET /api/stats. Does not drop unaarchived hours from memory.
   * @param {number} [now]
   */
  function dump(now = Date.now()) {
    const cutoff = hourIso(now - retainMs);
    const keys = [...hours.keys()].filter((hour) => hour >= cutoff).sort();
    return {
      hours: keys.map((hour) => ({
        hour,
        ips: serializeIps(hours.get(hour) || new Map(), geoByIp),
      })),
    };
  }

  /**
   * Full Durable Object snapshot, including hours waiting on GCS.
   * @param {number} [now]
   */
  function snapshot(now = Date.now()) {
    prune(now);
    const keys = [...hours.keys()].sort();
    return {
      hours: keys.map((hour) => ({
        hour,
        ips: serializeIps(hours.get(hour) || new Map(), geoByIp),
      })),
      archived: [...archived].sort(),
      geoByIp: Object.fromEntries(geoByIp),
    };
  }

  /**
   * Hours strictly before the current UTC hour that are not archived yet.
   * @param {number} [now]
   */
  function pendingArchive(now = Date.now()) {
    const current = hourIso(now);
    /** @type {{ hour: string, ips: ReturnType<typeof serializeIps> }[]} */
    const out = [];
    for (const hour of [...hours.keys()].sort()) {
      if (hour >= current) continue;
      if (archived.has(hour)) continue;
      out.push({ hour, ips: serializeIps(hours.get(hour) || new Map(), geoByIp) });
    }
    return out;
  }

  function markArchived(hour) {
    if (hours.has(hour)) archived.add(hour);
  }

  /**
   * Restore from dump() or snapshot() output.
   * @param {{
   *   hours?: { hour?: string, ips?: Record<string, unknown> }[],
   *   archived?: string[],
   *   geoByIp?: Record<string, unknown>,
   * }|null|undefined} state
   */
  function hydrate(state) {
    hours.clear();
    archived.clear();
    geoByIp.clear();
    const buckets = state && Array.isArray(state.hours) ? state.hours : [];
    for (const bucket of buckets) {
      const hour = bucket && typeof bucket.hour === 'string' ? bucket.hour : '';
      if (!hour) continue;
      const byIp = new Map();
      const ips = bucket.ips && typeof bucket.ips === 'object' ? bucket.ips : {};
      for (const [ip, raw] of Object.entries(ips)) {
        if (!ip) continue;
        const recObj = raw && typeof raw === 'object' ? raw : {};
        const gamesIn = recObj.games && typeof recObj.games === 'object' ? recObj.games : {};
        const geo = normalizeGeo(/** @type {{ geo?: unknown }} */ (recObj).geo);
        byIp.set(ip, {
          homeHits: Math.max(0, Number(recObj.homeHits) || 0),
          languages: { ...(recObj.languages && typeof recObj.languages === 'object' ? recObj.languages : {}) },
          games: copyRegisteredGames(/** @type {Record<string, unknown>} */ (gamesIn)),
          geo,
        });
        rememberGeo(ip, geo);
      }
      hours.set(hour, byIp);
    }
    const listed = state && Array.isArray(state.archived) ? state.archived : [];
    for (const hour of listed) {
      if (typeof hour === 'string' && hours.has(hour)) archived.add(hour);
    }
    const stored = state && state.geoByIp && typeof state.geoByIp === 'object' ? state.geoByIp : {};
    for (const [ip, geo] of Object.entries(stored)) {
      rememberGeo(ip, geo);
    }
    prune();
  }

  return { merge, dump, snapshot, prune, hydrate, pendingArchive, markArchived, rememberGeo };
}
