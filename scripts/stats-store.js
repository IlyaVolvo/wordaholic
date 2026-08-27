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

function emptyRecord() {
  return {
    homeHits: 0,
    languages: /** @type {Record<string, number>} */ ({}),
    games: {
      polywordlot: /** @type {Record<string, number>} */ ({}),
      transword: /** @type {Record<string, number>} */ ({}),
    },
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
 * In-memory UTC hourly buckets keyed by IP.
 * @param {{ retainMs?: number }} [opts]
 */
export function createStatsStore(opts = {}) {
  const retainMs = opts.retainMs ?? RETAIN_MS;
  /** @type {Map<string, Map<string, ReturnType<typeof emptyRecord>>>} */
  const hours = new Map();

  function prune(now = Date.now()) {
    const cutoff = hourIso(now - retainMs);
    for (const key of hours.keys()) {
      if (key < cutoff) hours.delete(key);
    }
  }

  /**
   * @param {string} ip
   * @param {{
   *   homeHits?: number,
   *   languages?: Record<string, number>,
   *   games?: { polywordlot?: Record<string, number>, transword?: Record<string, number> },
   * }} delta
   * @param {number} [now]
   */
  function merge(ip, delta, now = Date.now()) {
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
    if (delta.games?.polywordlot) mergeCounts(rec.games.polywordlot, delta.games.polywordlot);
    if (delta.games?.transword) mergeCounts(rec.games.transword, delta.games.transword);
  }

  function dump(now = Date.now()) {
    prune(now);
    const keys = [...hours.keys()].sort();
    return {
      hours: keys.map((hour) => {
        /** @type {Record<string, {
         *   homeHits: number,
         *   languages: Record<string, number>,
         *   games: { polywordlot: Record<string, number>, transword: Record<string, number> },
         * }>} */
        const ips = {};
        for (const [ip, rec] of hours.get(hour) || []) {
          ips[ip] = {
            homeHits: rec.homeHits,
            languages: { ...rec.languages },
            games: {
              polywordlot: { ...rec.games.polywordlot },
              transword: { ...rec.games.transword },
            },
          };
        }
        return { hour, ips };
      }),
    };
  }

  /**
   * Restore from dump() output (Durable Object storage).
   * @param {{ hours?: { hour?: string, ips?: Record<string, unknown> }[] }|null|undefined} snapshot
   */
  function hydrate(snapshot) {
    hours.clear();
    const buckets = snapshot && Array.isArray(snapshot.hours) ? snapshot.hours : [];
    for (const bucket of buckets) {
      const hour = bucket && typeof bucket.hour === 'string' ? bucket.hour : '';
      if (!hour) continue;
      const byIp = new Map();
      const ips = bucket.ips && typeof bucket.ips === 'object' ? bucket.ips : {};
      for (const [ip, raw] of Object.entries(ips)) {
        if (!ip) continue;
        const rec = raw && typeof raw === 'object' ? raw : {};
        const games = rec.games && typeof rec.games === 'object' ? rec.games : {};
        byIp.set(ip, {
          homeHits: Math.max(0, Number(rec.homeHits) || 0),
          languages: { ...(rec.languages && typeof rec.languages === 'object' ? rec.languages : {}) },
          games: {
            polywordlot: { ...(games.polywordlot && typeof games.polywordlot === 'object' ? games.polywordlot : {}) },
            transword: { ...(games.transword && typeof games.transword === 'object' ? games.transword : {}) },
          },
        });
      }
      hours.set(hour, byIp);
    }
    prune();
  }

  return { merge, dump, prune, hydrate };
}
