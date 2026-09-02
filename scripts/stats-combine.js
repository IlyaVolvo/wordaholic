/**
 * Combine GET /api/stats JSON dumps and GCS hour archives.
 *
 * The in-memory store is a running snapshot, so the same UTC hour in two files
 * is overlap, not extra traffic. For each hour+IP, keep field-wise max (the
 * more complete snapshot). IPv6 addresses then collapse to the first 8 bytes
 * (/64 prefix); different IIDs in the same hour are summed. Different hours
 * are added.
 */

import { STATS_GAME_IDS } from './stats-games.js';

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
 *   byGame: Record<string, number>,
 *   homeHits: number,
 *   languages: number,
 *   languageCodes: string[],
 *   perms: string,
 *   location: string,
 *   geo: StatsGeo | null,
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
  const placeParts = [];
  if (geo.city) placeParts.push(geo.city);
  if (geo.region && geo.region !== geo.city) placeParts.push(geo.region);
  const left = [country, placeParts.join(', ')].filter(Boolean).join(' · ');
  if (geo.asOrg) return left ? `${left} (${geo.asOrg})` : geo.asOrg;
  return left;
}

/**
 * @param {string} code
 */
export function formatCountry(code) {
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
  for (const gameId of STATS_GAME_IDS) {
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
  for (const gameId of STATS_GAME_IDS) {
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
  for (const gameId of STATS_GAME_IDS) {
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
  for (const gameId of STATS_GAME_IDS) {
    const counts = rec.games[gameId] || {};
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
  for (const gameId of STATS_GAME_IDS) {
    const counts = rec.games[gameId] || {};
    for (const [perm, n] of Object.entries(counts)) {
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
    /** @type {Record<string, number>} */
    const byGame = {};
    for (const gameId of STATS_GAME_IDS) {
      const counts = rec.games[gameId] || {};
      byGame[gameId] = Object.keys(counts).filter((k) => counts[k]).length;
    }
    return {
      ip,
      addrs: addrs.size,
      games: perms.length,
      byGame,
      homeHits: rec.homeHits,
      languages: languageCodes.length,
      languageCodes,
      perms: perms.join(' '),
      location: formatLocation(rec.geo),
      geo: rec.geo,
    };
  });
}

/**
 * @param {StatsRow[]} rows
 */
export function combineTotals(rows) {
  /** @type {Set<string>} */
  const languageCodes = new Set();
  const emptyByGame = Object.fromEntries(STATS_GAME_IDS.map((id) => [id, 0]));
  const acc = (rows || []).reduce(
    (a, r) => {
      for (const code of r.languageCodes || []) languageCodes.add(code);
      /** @type {Record<string, number>} */
      const byGame = {};
      for (const id of STATS_GAME_IDS) {
        byGame[id] = (a.byGame[id] || 0) + (r.byGame[id] || 0);
      }
      return {
        addrs: a.addrs + r.addrs,
        games: a.games + r.games,
        byGame,
        homeHits: a.homeHits + r.homeHits,
      };
    },
    { addrs: 0, games: 0, byGame: emptyByGame, homeHits: 0 }
  );
  const codes = [...languageCodes].sort();
  return { ...acc, languages: codes.length, languageCodes: codes };
}

export const TREND_INTERVALS = ['hours', 'days', 'weeks', 'months'];

/**
 * @param {unknown} value
 * @returns {'hours' | 'days' | 'weeks' | 'months'}
 */
export function parseTrendInterval(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'hours' || v === 'days' || v === 'weeks' || v === 'months') return v;
  return 'days';
}

/**
 * @param {unknown} value
 * @returns {'totals' | 'trends'}
 */
export function parseStatsTab(value) {
  return String(value || '').trim().toLowerCase() === 'trends' ? 'trends' : 'totals';
}

/**
 * @param {string} hourIso
 */
function truncateHourIso(hourIso) {
  const d = new Date(hourIso);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCMinutes(0, 0, 0);
  d.setUTCMilliseconds(0);
  return d.toISOString();
}

/**
 * ISO week key Monday-based, e.g. 2026-W09.
 * @param {Date} date
 */
function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * @param {string} hourIso
 * @param {'hours' | 'days' | 'weeks' | 'months'} interval
 */
export function trendBucketKey(hourIso, interval) {
  const hour = truncateHourIso(hourIso);
  if (!hour) return '';
  if (interval === 'hours') return hour;
  if (interval === 'days') return hour.slice(0, 10);
  if (interval === 'months') return hour.slice(0, 7);
  return isoWeekKey(new Date(hour));
}

/**
 * @param {string} key
 * @param {'hours' | 'days' | 'weeks' | 'months'} interval
 */
export function trendBucketLabel(key, interval) {
  if (!key) return '';
  if (interval === 'hours') {
    return key.replace('T', ' ').replace(/:00\.000Z$/, 'Z').replace(/\.000Z$/, 'Z');
  }
  return key;
}

/**
 * @param {Map<string, StatsRecord>} byIp
 */
function metricsFromHourIpMap(byIp) {
  const collapsed = collapseHour(byIp);
  let merged = emptyRecord();
  for (const { rec } of collapsed.values()) {
    merged = sumRecord(merged, rec);
  }
  /** @type {Record<string, number>} */
  const byGame = Object.fromEntries(STATS_GAME_IDS.map((id) => [id, 0]));
  let games = 0;
  for (const id of STATS_GAME_IDS) {
    let n = 0;
    for (const v of Object.values(merged.games[id] || {})) n += Number(v) || 0;
    byGame[id] = n;
    games += n;
  }
  return { games, byGame };
}

/**
 * @param {string} startHourIso
 * @param {string} endHourIso
 * @param {'hours' | 'days' | 'weeks' | 'months'} interval
 */
function enumerateTrendBucketKeys(startHourIso, endHourIso, interval) {
  const start = truncateHourIso(startHourIso);
  const end = truncateHourIso(endHourIso);
  /** @type {string[]} */
  const keys = [];
  if (!start || !end || start > end) return keys;
  const seen = new Set();
  let t = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const HOUR_MS = 60 * 60 * 1000;
  while (t <= endMs) {
    const hour = new Date(t).toISOString();
    const key = trendBucketKey(hour, interval);
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
    t += HOUR_MS;
  }
  return keys;
}

/**
 * Time-bucketed activity totals (event counts) for Trends.
 *
 * @param {{ source: string, body: unknown }[]} inputs
 * @param {{ from?: string | null, toExclusive?: string | null }} [range]
 * @param {'hours' | 'days' | 'weeks' | 'months'} [interval]
 * @returns {{ key: string, label: string, games: number, byGame: Record<string, number> }[]}
 */
export function combineTrends(inputs, range = {}, interval = 'days') {
  const grain = parseTrendInterval(interval);
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

  const hours = [...byHour.keys()].sort();
  let startH = hours[0] || '';
  let endH = hours[hours.length - 1] || '';
  if (range.from) startH = truncateHourIso(range.from) || startH;
  if (range.toExclusive) {
    const end = new Date(range.toExclusive);
    end.setUTCHours(end.getUTCHours() - 1);
    endH = truncateHourIso(end.toISOString()) || endH;
  }
  if (!startH || !endH) return [];

  /** @type {Map<string, { games: number, byGame: Record<string, number> }>} */
  const acc = new Map();
  for (const hour of hours) {
    const m = metricsFromHourIpMap(byHour.get(hour) || new Map());
    const key = trendBucketKey(hour, grain);
    if (!key) continue;
    const prev = acc.get(key);
    if (!prev) {
      acc.set(key, { games: m.games, byGame: { ...m.byGame } });
    } else {
      prev.games += m.games;
      for (const id of STATS_GAME_IDS) {
        prev.byGame[id] = (prev.byGame[id] || 0) + (m.byGame[id] || 0);
      }
    }
  }

  const emptyByGame = Object.fromEntries(STATS_GAME_IDS.map((id) => [id, 0]));
  return enumerateTrendBucketKeys(startH, endH, grain).map((key) => {
    const m = acc.get(key) || { games: 0, byGame: { ...emptyByGame } };
    return {
      key,
      label: trendBucketLabel(key, grain),
      games: m.games,
      byGame: m.byGame,
    };
  });
}