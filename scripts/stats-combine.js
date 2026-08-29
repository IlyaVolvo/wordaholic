/**
 * Combine GET /api/stats JSON dumps and GCS hour archives.
 *
 * The in-memory store is a running snapshot, so the same UTC hour in two files
 * is overlap, not extra traffic. For each hour+IP, keep field-wise max (the
 * more complete snapshot). IPv6 addresses then collapse to the first 8 bytes
 * (/64 prefix); different IIDs in the same hour are summed. Different hours
 * are added.
 */

const GAME_IDS = ['polywordlot', 'transword'];

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @typedef {{ country: string, city: string, region: string, asOrg: string }} StatsGeo
 * @typedef {{
 *   homeHits: number,
 *   languages: Record<string, number>,
 *   games: Record<string, Record<string, number>>,
 *   geo: StatsGeo | null,
 * }} StatsRecord
 * @typedef {{
 *   ip: string,
 *   addrs: number,
 *   games: number,
 *   polywordlot: number,
 *   transword: number,
 *   homeHits: number,
 *   languages: number,
 *   languageCodes: string[],
 *   perms: string,
 *   location: string,
 * }} StatsRow
 */

/**
 * Inclusive UTC day start / exclusive next-day bound from YYYY-MM-DD query values.
 * Invalid values are ignored.
 *
 * @param {string} [fromStr]
 * @param {string} [toStr]
 * @returns {{ from: string | null, toExclusive: string | null }}
 */
export function parseDateRange(fromStr, toStr) {
  const from = parseUtcDayStart(fromStr);
  const toExclusive = parseUtcDayEndExclusive(toStr);
  return { from, toExclusive };
}

/**
 * @param {string} [value]
 */
function parseUtcDayStart(value) {
  if (!value || !DAY_RE.test(value)) return null;
  return `${value}T00:00:00.000Z`;
}

/**
 * @param {string} [value]
 */
function parseUtcDayEndExclusive(value) {
  if (!value || !DAY_RE.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

/**
 * @param {string} hour
 * @param {{ from?: string | null, toExclusive?: string | null }} [range]
 */
export function hourInRange(hour, range = {}) {
  if (range.from && hour < range.from) return false;
  if (range.toExclusive && hour >= range.toExclusive) return false;
  return true;
}

/**
 * @param {unknown} raw
 * @returns {StatsGeo | null}
 */
export function normalizeGeo(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = /** @type {Record<string, unknown>} */ (raw);
  const country = countryCode(rec.country);
  const city = typeof rec.city === 'string' ? rec.city.trim() : '';
  const region = typeof rec.region === 'string' ? rec.region.trim() : '';
  const asOrgRaw = rec.asOrg || rec.asOrganization;
  const asOrg = typeof asOrgRaw === 'string' ? asOrgRaw.trim() : '';
  if (!country && !city && !region && !asOrg) return null;
  return { country, city, region, asOrg };
}

/**
 * @param {unknown} value
 */
function countryCode(value) {
  const c = String(value || '').trim().toUpperCase();
  if (!c || c === 'XX' || c === 'T1') return '';
  return c;
}

/**
 * @param {StatsGeo | null | undefined} geo
 */
function geoScore(geo) {
  if (!geo) return 0;
  return [geo.country, geo.city, geo.region, geo.asOrg].filter(Boolean).length;
}

/**
 * @param {StatsGeo | null | undefined} a
 * @param {StatsGeo | null | undefined} b
 * @returns {StatsGeo | null}
 */
export function pickRicherGeo(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return geoScore(b) > geoScore(a) ? b : a;
}

/**
 * @param {StatsGeo | null | undefined} geo
 */
export function formatLocation(geo) {
  if (!geo) return '';
  const country = formatCountry(geo.country);
  const place = geo.city || geo.region;
  const left = [country, place].filter(Boolean).join(' · ');
  if (geo.asOrg) return left ? `${left} (${geo.asOrg})` : geo.asOrg;
  return left;
}

/**
 * @param {string} code
 */
function formatCountry(code) {
  if (!code) return '';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

/**
 * @param {unknown} value
 * @returns {Record<string, number>}
 */
function asCountMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  /** @type {Record<string, number>} */
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    const n = Number(raw);
    if (!key || !Number.isFinite(n) || n <= 0) continue;
    out[key] = n;
  }
  return out;
}

/**
 * @param {unknown} raw
 * @returns {StatsRecord}
 */
export function normalizeRecord(raw) {
  const rec = raw && typeof raw === 'object' ? raw : {};
  const gamesIn = rec.games && typeof rec.games === 'object' ? rec.games : {};
  /** @type {Record<string, Record<string, number>>} */
  const games = {};
  for (const gameId of new Set([...GAME_IDS, ...Object.keys(gamesIn)])) {
    games[gameId] = asCountMap(gamesIn[gameId]);
  }
  return {
    homeHits: Math.max(0, Number(rec.homeHits) || 0),
    languages: asCountMap(rec.languages),
    games,
    geo: normalizeGeo(/** @type {{ geo?: unknown }} */ (rec).geo),
  };
}

/**
 * @param {Record<string, number>} a
 * @param {Record<string, number>} b
 */
function maxMap(a, b) {
  /** @type {Record<string, number>} */
  const out = { ...a };
  for (const [key, value] of Object.entries(b)) {
    out[key] = Math.max(out[key] || 0, value);
  }
  return out;
}

/**
 * @param {Record<string, number>} a
 * @param {Record<string, number>} b
 */
function sumMap(a, b) {
  /** @type {Record<string, number>} */
  const out = { ...a };
  for (const [key, value] of Object.entries(b)) {
    out[key] = (out[key] || 0) + value;
  }
  return out;
}

/**
 * @param {StatsRecord} a
 * @param {StatsRecord} b
 * @returns {StatsRecord}
 */
function maxRecord(a, b) {
  /** @type {Record<string, Record<string, number>>} */
  const games = {};
  const ids = new Set([...Object.keys(a.games), ...Object.keys(b.games)]);
  for (const gameId of ids) {
    games[gameId] = maxMap(a.games[gameId] || {}, b.games[gameId] || {});
  }
  return {
    homeHits: Math.max(a.homeHits, b.homeHits),
    languages: maxMap(a.languages, b.languages),
    games,
    geo: pickRicherGeo(a.geo, b.geo),
  };
}

/**
 * @param {StatsRecord} a
 * @param {StatsRecord} b
 * @returns {StatsRecord}
 */
function sumRecord(a, b) {
  /** @type {Record<string, Record<string, number>>} */
  const games = {};
  const ids = new Set([...Object.keys(a.games), ...Object.keys(b.games)]);
  for (const gameId of ids) {
    games[gameId] = sumMap(a.games[gameId] || {}, b.games[gameId] || {});
  }
  return {
    homeHits: a.homeHits + b.homeHits,
    languages: sumMap(a.languages, b.languages),
    games,
    geo: pickRicherGeo(a.geo, b.geo),
  };
}

function emptyRecord() {
  return normalizeRecord({});
}

/**
 * Expand IPv6 to eight 16-bit hex groups (lowercase, zero-padded).
 * @param {string} ip
 * @returns {string[] | null}
 */
function expandIPv6(ip) {
  const bare = ip.split('%')[0].trim().toLowerCase();
  if (!bare.includes(':')) return null;
  const v4tail = bare.match(/:(\d{1,3}(?:\.\d{1,3}){3})$/);
  let core = v4tail ? bare.slice(0, -v4tail[1].length) : bare;
  if (v4tail) {
    const oct = v4tail[1].split('.').map(Number);
    if (oct.length !== 4 || oct.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
      return null;
    }
    const hi = ((oct[0] << 8) | oct[1]).toString(16).padStart(4, '0');
    const lo = ((oct[2] << 8) | oct[3]).toString(16).padStart(4, '0');
    core = `${core}${hi}:${lo}`;
  }
  let head;
  let tail;
  if (core.includes('::')) {
    const parts = core.split('::');
    if (parts.length !== 2) return null;
    head = parts[0] ? parts[0].split(':') : [];
    tail = parts[1] ? parts[1].split(':') : [];
  } else {
    head = core.split(':');
    tail = [];
  }
  const norm = (groups) =>
    groups
      .filter((g) => g.length > 0)
      .map((g) => {
        if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
        return g.padStart(4, '0');
      });
  const left = norm(head);
  const right = norm(tail);
  if (left.includes(null) || right.includes(null)) return null;
  const missing = 8 - left.length - right.length;
  if (core.includes('::')) {
    if (missing < 1) return null;
  } else if (missing !== 0) {
    return null;
  }
  const groups = [...left, ...Array(missing).fill('0000'), ...right];
  return groups.length === 8 ? groups : null;
}

/**
 * IPv6 identity is the first 8 bytes (network /64). IPv4-mapped IPv6 counts as
 * IPv4. IPv4 and unparseable values are unchanged.
 * @param {string} ip
 */
export function ipIdentity(ip) {
  const bare = String(ip).split('%')[0].trim();
  const v4mapped = bare.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (v4mapped) return v4mapped[1];
  if (bare.includes('.')) return bare;
  const groups = expandIPv6(bare);
  if (!groups) return bare;
  const prefix = groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+/, '') || '0')
    .join(':');
  return `${prefix}::/64`;
}

/**
 * @param {Map<string, StatsRecord>} byIp
 * @returns {Map<string, { rec: StatsRecord, addrs: Set<string> }>}
 */
function collapseHour(byIp) {
  /** @type {Map<string, { rec: StatsRecord, addrs: Set<string> }>} */
  const out = new Map();
  for (const [ip, rec] of byIp) {
    const id = ipIdentity(ip);
    const prev = out.get(id);
    if (!prev) {
      out.set(id, { rec, addrs: new Set([ip]) });
    } else {
      prev.rec = sumRecord(prev.rec, rec);
      prev.addrs.add(ip);
    }
  }
  return out;
}

/**
 * @param {unknown} body
 * @param {string} source
 * @param {{ from?: string | null, toExclusive?: string | null }} [range]
 * @returns {{ hour: string, ip: string, rec: StatsRecord }[]}
 */
export function extractRows(body, source, range = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error(`${source}: expected { hours: [...] }`);
  }
  const hours = /** @type {{ hours?: unknown }} */ (body).hours;
  if (!Array.isArray(hours)) throw new Error(`${source}: missing hours array`);
  /** @type {{ hour: string, ip: string, rec: StatsRecord }[]} */
  const rows = [];
  for (const bucket of hours) {
    if (!bucket || typeof bucket !== 'object') continue;
    const hour = String(bucket.hour || '');
    if (!hour) continue;
    if (!hourInRange(hour, range)) continue;
    const ips = bucket.ips && typeof bucket.ips === 'object' ? bucket.ips : {};
    for (const [ip, rec] of Object.entries(ips)) {
      if (!ip) continue;
      rows.push({ hour, ip, rec: normalizeRecord(rec) });
    }
  }
  return rows;
}

/**
 * @param {StatsRecord} rec
 */
function distinctPerms(rec) {
  /** @type {string[]} */
  const keys = [];
  for (const [gameId, counts] of Object.entries(rec.games)) {
    for (const perm of Object.keys(counts).sort()) {
      if (counts[perm]) keys.push(`${gameId}:${perm}`);
    }
  }
  return keys;
}

/**
 * Distinct language codes from game permutation keys (`en,5`, `en,2,4`).
 * @param {StatsRecord} rec
 * @returns {string[]}
 */
function languageCodesPlayed(rec) {
  /** @type {Set<string>} */
  const codes = new Set();
  for (const counts of Object.values(rec.games)) {
    for (const [perm, n] of Object.entries(counts || {})) {
      if (!n) continue;
      const lang = perm.split(',')[0].trim();
      if (lang) codes.add(lang);
    }
  }
  return [...codes].sort();
}

/**
 * @param {{ source: string, body: unknown }[]} inputs
 * @param {{ from?: string | null, toExclusive?: string | null }} [range]
 * @returns {StatsRow[]}
 */
export function combineBodies(inputs, range = {}) {
  /** @type {Map<string, Map<string, StatsRecord>>} */
  const byHour = new Map();
  for (const { source, body } of inputs) {
    for (const { hour, ip, rec } of extractRows(body, source, range)) {
      let byIp = byHour.get(hour);
      if (!byIp) {
        byIp = new Map();
        byHour.set(hour, byIp);
      }
      const prev = byIp.get(ip);
      byIp.set(ip, prev ? maxRecord(prev, rec) : rec);
    }
  }

  /** @type {Map<string, { rec: StatsRecord, addrs: Set<string> }>} */
  const byId = new Map();
  for (const hour of [...byHour.keys()].sort()) {
    const collapsed = collapseHour(byHour.get(hour) || new Map());
    for (const [id, { rec, addrs }] of collapsed) {
      const prev = byId.get(id);
      if (!prev) {
        byId.set(id, { rec, addrs: new Set(addrs) });
      } else {
        prev.rec = sumRecord(prev.rec, rec);
        for (const addr of addrs) prev.addrs.add(addr);
      }
    }
  }

  const ids = [...byId.keys()].sort();
  return ids.map((ip) => {
    const { rec, addrs } = byId.get(ip) || { rec: emptyRecord(), addrs: new Set() };
    const perms = distinctPerms(rec);
    const languageCodes = languageCodesPlayed(rec);
    const poly = Object.keys(rec.games.polywordlot || {}).filter((k) => rec.games.polywordlot[k]);
    const trans = Object.keys(rec.games.transword || {}).filter((k) => rec.games.transword[k]);
    return {
      ip,
      addrs: addrs.size,
      games: perms.length,
      polywordlot: poly.length,
      transword: trans.length,
      homeHits: rec.homeHits,
      languages: languageCodes.length,
      languageCodes,
      perms: perms.join(' '),
      location: formatLocation(rec.geo),
    };
  });
}

/**
 * @param {StatsRow[]} rows
 */
export function combineTotals(rows) {
  return rows.reduce(
    (acc, r) => ({
      addrs: acc.addrs + r.addrs,
      games: acc.games + r.games,
      polywordlot: acc.polywordlot + r.polywordlot,
      transword: acc.transword + r.transword,
      homeHits: acc.homeHits + r.homeHits,
      languages: acc.languages + r.languages,
    }),
    { addrs: 0, games: 0, polywordlot: 0, transword: 0, homeHits: 0, languages: 0 }
  );
}