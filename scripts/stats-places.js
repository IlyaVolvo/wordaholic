/**
 * Persistent place → lat/lon map for stats (GCS object places.json).
 * Key: COUNTRY|region|city (region/city lowercased). Existing keys are never overwritten.
 */
import { countryCode, normalizeGeo } from './stats-combine.js';
import { STATS_CAPITALS, STATS_CITY_COORDS, resolveLocalityCoords } from './stats-capitals.js';

export const PLACES_FORMAT = 'wordaholic-stats-places';
export const PLACES_VERSION = 1;

/**
 * @typedef {{
 *   country: string,
 *   region: string,
 *   city: string,
 *   lat: number | null,
 *   lon: number | null,
 *   source: 'table' | 'capital' | 'geocode' | 'unresolved' | 'manual',
 * }} StatsPlace
 */

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const PHOTON = 'https://photon.komoot.io/api/';
const GEOCODE_UA = 'WordaholicStatsPlaces/1.0 (https://wordaholic.volvovski.com)';
const GEOCODE_GAP_MS = 1100;

/**
 * @param {string} country
 * @param {string} [region]
 * @param {string} [city]
 */
export function placeKey(country, region = '', city = '') {
  const cc = countryCode(country);
  const regionKey = String(region || '').trim().toLowerCase();
  const cityKey = String(city || '').trim().toLowerCase();
  return `${cc}|${regionKey}|${cityKey}`;
}

/**
 * @param {unknown} raw
 * @returns {{ format: string, version: number, updatedAt: string, places: Record<string, StatsPlace> }}
 */
export function emptyPlacesDocument() {
  return {
    format: PLACES_FORMAT,
    version: PLACES_VERSION,
    updatedAt: new Date().toISOString(),
    places: {},
  };
}

/**
 * @param {unknown} raw
 */
export function parsePlacesDocument(raw) {
  const doc = emptyPlacesDocument();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return doc;
  const rec = /** @type {Record<string, unknown>} */ (raw);
  const src = rec.places && typeof rec.places === 'object' && !Array.isArray(rec.places) ? rec.places : {};
  for (const [key, value] of Object.entries(src)) {
    const place = asPlace(value);
    if (!place || !key) continue;
    doc.places[key] = place;
  }
  if (typeof rec.updatedAt === 'string' && rec.updatedAt) doc.updatedAt = rec.updatedAt;
  return doc;
}

/**
 * @param {unknown} raw
 * @returns {StatsPlace | null}
 */
function asPlace(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = /** @type {Record<string, unknown>} */ (raw);
  const country = countryCode(rec.country);
  if (!country) return null;
  const region = typeof rec.region === 'string' ? rec.region.trim() : '';
  const city = typeof rec.city === 'string' ? rec.city.trim() : '';
  const lat = rec.lat == null || rec.lat === '' ? null : Number(rec.lat);
  const lon = rec.lon == null || rec.lon === '' ? null : Number(rec.lon);
  const source = rec.source;
  return {
    country,
    region,
    city,
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    source:
      source === 'table' ||
      source === 'capital' ||
      source === 'geocode' ||
      source === 'manual' ||
      source === 'unresolved'
        ? source
        : lat != null && lon != null
          ? 'manual'
          : 'unresolved',
  };
}

/**
 * @param {string} country
 * @param {string} [region]
 * @param {string} [city]
 * @returns {StatsPlace | null}
 */
export function suggestPlace(country, region = '', city = '') {
  const cc = countryCode(country);
  if (!cc) return null;
  const regionName = String(region || '').trim();
  const cityName = String(city || '').trim();
  if (cityName) {
    const hit = STATS_CITY_COORDS[`${cc}|${cityName.toLowerCase()}`];
    if (hit) {
      return {
        country: cc,
        region: regionName,
        city: cityName,
        lat: hit.lat,
        lon: hit.lon,
        source: 'table',
      };
    }
    return {
      country: cc,
      region: regionName,
      city: cityName,
      lat: null,
      lon: null,
      source: 'unresolved',
    };
  }
  const cap = STATS_CAPITALS[cc];
  if (cap) {
    return {
      country: cc,
      region: regionName,
      city: '',
      lat: cap.lat,
      lon: cap.lon,
      source: 'capital',
    };
  }
  return {
    country: cc,
    region: regionName,
    city: '',
    lat: null,
    lon: null,
    source: 'unresolved',
  };
}

/**
 * Lookup with fallbacks: exact → country+city → country+region → country.
 * @param {Record<string, StatsPlace>} places
 * @param {string} country
 * @param {string} [region]
 * @param {string} [city]
 */
export function lookupPlace(places, country, region = '', city = '') {
  const keys = [placeKey(country, region, city), placeKey(country, '', city)];
  for (const key of keys) {
    const row = places[key];
    if (!row) continue;
    if (row.lat == null || row.lon == null) continue;
    return row;
  }
  const cc = countryCode(country);
  const cityKey = String(city || '').trim().toLowerCase();
  if (cc && cityKey) {
    for (const row of Object.values(places)) {
      if (row.country !== cc) continue;
      if (String(row.city || '').trim().toLowerCase() !== cityKey) continue;
      if (row.lat == null || row.lon == null) continue;
      return row;
    }
  }
  for (const key of [placeKey(country, region, ''), placeKey(country, '', '')]) {
    const row = places[key];
    if (!row) continue;
    if (row.lat == null || row.lon == null) continue;
    return row;
  }
  return null;
}

/**
 * Places file first, then the static city/capital table.
 * @param {Record<string, StatsPlace>} [places]
 * @param {string} country
 * @param {string} [region]
 * @param {string} [city]
 * @returns {{ lat: number, lon: number, capitalFallback: boolean, placeLabel: string } | null}
 */
export function resolvePlaceCoords(places, country, region = '', city = '') {
  const row = places ? lookupPlace(places, country, region, city) : null;
  if (row && row.lat != null && row.lon != null && (!city || row.city)) {
    return {
      lat: row.lat,
      lon: row.lon,
      capitalFallback: !row.city || row.source === 'capital',
      placeLabel: row.city || city || row.region || country,
    };
  }
  return resolveLocalityCoords(country, city);
}

/**
 * @param {Record<string, StatsPlace>} places
 * @param {StatsPlace} place
 * @returns {boolean} true if inserted
 */
export function appendPlace(places, place) {
  const key = placeKey(place.country, place.region, place.city);
  if (!key.startsWith(place.country) || places[key]) return false;
  places[key] = place;
  return true;
}

/**
 * Collect distinct geos from hour-archive JSON bodies.
 * @param {unknown} body
 * @returns {{ country: string, region: string, city: string }[]}
 */
export function geosFromHourBody(body) {
  /** @type {Map<string, { country: string, region: string, city: string }>} */
  const found = new Map();
  if (!body || typeof body !== 'object') return [];
  const hours = /** @type {{ hours?: unknown }} */ (body).hours;
  if (!Array.isArray(hours)) return [];
  for (const bucket of hours) {
    const ips = bucket?.ips && typeof bucket.ips === 'object' ? bucket.ips : {};
    for (const rec of Object.values(ips)) {
      const geo = normalizeGeo(/** @type {{ geo?: unknown }} */ (rec || {}).geo);
      if (!geo?.country) continue;
      const row = { country: geo.country, region: geo.region || '', city: geo.city || '' };
      found.set(placeKey(row.country, row.region, row.city), row);
    }
  }
  return [...found.values()];
}

/**
 * Add missing places (and a country-only fallback) from discovered geos.
 * @param {Record<string, StatsPlace>} places
 * @param {{ country: string, region: string, city: string }[]} geos
 */
export function appendMissingPlaces(places, geos) {
  let added = 0;
  for (const geo of geos) {
    const suggested = suggestPlace(geo.country, geo.region, geo.city);
    if (suggested && appendPlace(places, suggested)) added += 1;
    const countryOnly = suggestPlace(geo.country, '', '');
    if (countryOnly && appendPlace(places, countryOnly)) added += 1;
  }
  return added;
}

/**
 * @param {Record<string, StatsPlace>} places
 */
export function sortPlaces(places) {
  /** @type {Record<string, StatsPlace>} */
  const out = {};
  for (const key of Object.keys(places).sort()) out[key] = places[key];
  return out;
}

/**
 * Fold MaxMind / UNGEGN Latin (Naẕerat ‘Illit → Nazerat Illit).
 * @param {string} name
 */
export function foldPlaceName(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[‘’‚‛ʻʼʾʿ`´]/g, "'")
    .replace(/'+/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Search spellings: original, folded, no apostrophe, BGN q→k (Ya‘aqov → Yaakov).
 * @param {string} city
 */
export function cityQueryNames(city) {
  /** @type {string[]} */
  const names = [];
  const add = (value) => {
    const next = String(value || '').trim();
    if (next && !names.includes(next)) names.push(next);
  };
  add(city);
  const folded = foldPlaceName(city);
  add(folded);
  add(folded.replace(/'/g, ''));
  const asK = (value) => value.replace(/q/gi, (ch) => (ch === 'Q' ? 'K' : 'k'));
  add(asK(folded));
  add(asK(folded.replace(/'/g, '')));
  return names;
}

/**
 * Nominatim, then Photon. Same helper the Worker can call later.
 * @param {{ country: string, region?: string, city?: string }} place
 * @returns {Promise<{ lat: number, lon: number } | null>}
 */
export async function geocodePlace(place) {
  const cc = countryCode(place.country);
  const city = String(place.city || '').trim();
  const region = String(place.region || '').trim();
  if (!cc || !city) return null;
  const names = cityQueryNames(city);
  const countrycodes = cc.toLowerCase();
  for (const name of names) {
    const attempts = [
      { fields: { city: name, state: region || undefined, countrycodes }, kind: 'structured' },
      { fields: { city: name, countrycodes }, kind: 'structured' },
      { fields: { q: [name, region, cc].filter(Boolean).join(', '), countrycodes }, kind: 'free' },
    ];
    for (const attempt of attempts) {
      const hit = await nominatimSearch(attempt.fields, { country: cc, city, region }, attempt.kind);
      if (hit) return hit;
      await sleep(GEOCODE_GAP_MS);
    }
  }
  return photonSearch({ city, region, country: cc });
}

/**
 * @param {Record<string, string | undefined>} fields
 * @param {{ country: string, city: string, region: string }} place
 * @param {'structured' | 'free'} kind
 */
async function nominatimSearch(fields, place, kind) {
  const params = new URLSearchParams({
    format: 'jsonv2',
    limit: '1',
    addressdetails: '1',
    namedetails: '1',
  });
  for (const [key, value] of Object.entries(fields)) {
    if (value) params.set(key, value);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${NOMINATIM}?${params}`, {
      headers: { Accept: 'application/json', 'User-Agent': GEOCODE_UA },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const rows = await res.json();
    const first = Array.isArray(rows) ? rows[0] : null;
    return settlementCoords(
      {
        lat: first?.lat,
        lon: first?.lon,
        country: first?.address?.country_code,
        type: first?.addresstype || first?.type,
        names: nominatimNames(first),
      },
      place,
      kind
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {unknown} hit
 */
function nominatimNames(hit) {
  if (!hit || typeof hit !== 'object') return [];
  const rec = /** @type {Record<string, unknown>} */ (hit);
  const address = rec.address && typeof rec.address === 'object' ? /** @type {Record<string, unknown>} */ (rec.address) : {};
  const namedetails =
    rec.namedetails && typeof rec.namedetails === 'object' ? /** @type {Record<string, unknown>} */ (rec.namedetails) : {};
  return [
    rec.name,
    rec.display_name,
    address.city,
    address.town,
    address.village,
    address.municipality,
    address.hamlet,
    address.suburb,
    ...Object.values(namedetails),
  ]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => String(value));
}

/**
 * Fuzzier OSM search for MaxMind spellings Nominatim misses (e.g. Meisir → Meiser).
 * @param {{ city: string, region: string, country: string }} place
 */
async function photonSearch(place) {
  const q = [place.city, place.region, place.country].filter(Boolean).join(', ');
  const params = new URLSearchParams({ q, limit: '5' });
  params.append('osm_tag', 'place');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${PHOTON}?${params}`, {
      headers: { Accept: 'application/json', 'User-Agent': GEOCODE_UA },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const body = await res.json();
    const features = Array.isArray(body?.features) ? body.features : [];
    for (const feature of features) {
      const props = feature?.properties || {};
      const coords = feature?.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;
      const hit = settlementCoords(
        {
          lat: coords[1],
          lon: coords[0],
          country: props.countrycode,
          type: props.osm_value || props.type,
          names: [props.name, props.city, props.locality, props.district].filter((value) => typeof value === 'string'),
        },
        place,
        'free'
      );
      if (hit) return hit;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {{ lat: unknown, lon: unknown, country?: unknown, type?: unknown, names?: string[] }} hit
 * @param {{ country: string, city?: string, region?: string }} place
 * @param {'structured' | 'free'} kind
 */
function settlementCoords(hit, place, kind) {
  const lat = Number(hit.lat);
  const lon = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const got = countryCode(hit.country);
  if (got && got !== place.country) return null;
  const city = normalizeName(place.city);
  if (!city) return { lat, lon };
  const type = String(hit.type || '').toLowerCase();
  if (['country', 'state', 'continent', 'region', 'province'].includes(type)) return null;
  const names = (hit.names || []).map(normalizeName).filter(Boolean);
  if (names.some((name) => namesClose(name, city))) return { lat, lon };
  const region = normalizeName(place.region);
  if (region && city !== region && names.some((name) => namesClose(name, region))) return null;
  const specific = ['village', 'hamlet', 'isolated_dwelling', 'suburb', 'neighbourhood', 'neighborhood', 'quarter'];
  const broad = ['city', 'town', 'municipality', 'city_district', 'administrative'];
  if (specific.includes(type)) return { lat, lon };
  if (kind === 'structured' && broad.includes(type)) return { lat, lon };
  return null;
}

/** @param {string} [name] */
function normalizeName(name) {
  return foldPlaceName(name || '')
    .toLowerCase()
    .replace(/['.]/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** @param {string} a @param {string} b */
function namesClose(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
  const maxDist = Math.min(a.length, b.length) >= 8 ? 2 : 1;
  return Math.min(a.length, b.length) >= 5 && levenshtein(a, b) <= maxDist;
}

/** @param {string} a @param {string} b */
function levenshtein(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => {
    const row = new Array(b.length + 1);
    row[0] = i;
    return row;
  });
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return rows[a.length][b.length];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fill lat/lon on unresolved city rows. Leaves table/capital/manual rows alone.
 * @param {Record<string, StatsPlace>} places
 * @param {{
 *   onFilled?: (place: StatsPlace, remaining: number) => void,
 *   onFailed?: (place: StatsPlace, remaining: number) => void,
 * }} [opts]
 */
export async function fillUnresolvedPlaces(places, opts = {}) {
  const pending = Object.values(places).filter(
    (p) => p.city && (p.lat == null || p.lon == null) && p.source !== 'manual'
  );
  let filled = 0;
  let failed = 0;
  for (let i = 0; i < pending.length; i += 1) {
    if (i > 0) await sleep(GEOCODE_GAP_MS);
    const place = pending[i];
    const hit = await geocodePlace(place);
    if (!hit) {
      failed += 1;
      opts.onFailed?.(place, pending.length - i - 1);
      continue;
    }
    place.lat = hit.lat;
    place.lon = hit.lon;
    place.source = 'geocode';
    filled += 1;
    opts.onFilled?.(place, pending.length - i - 1);
  }
  return { pending: pending.length, filled, failed };
}
