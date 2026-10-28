import { BODY_MAX_BYTES, parseStatsDelta } from '../../../scripts/stats-delta.js';
import { combineBodies, combineTrends, normalizeGeo, parseDateRange, parseTrendInterval } from '../../../scripts/stats-combine.js';
import { canonicalPath, isStatsWorkerPath } from '../../../scripts/stats-path.js';
import { renderStatsHtml, trendIdentityAllowIds, trendLanguageAllow } from '../../../scripts/stats-page.js';
import { buildStatsGeoPayload } from '../../../scripts/stats-geo-api.js';
import { lookupMissingGeos } from '../../../scripts/stats-geo-lookup.js';
import { statsInputsFromTables } from '../../../scripts/stats-hours.js';
import {
  aggregateBoard,
  parseBrowserId,
  parseNickname,
  parsePlayReport,
  playGame,
  rankBoard,
  variantAllowed,
} from '../../../scripts/play-model.js';
import {
  addLiveDay,
  applyPlay,
  boardFinishes,
  browserNickname,
  catalogRows,
  changeNickname,
  ensureBrowser,
  ensureSchema,
  fillLiveGeo,
  getCutover,
  importFrozenDays,
  importPlaces,
  loadPlacesDocument,
  loadTableRows,
  setCutoverIfEmpty,
} from './db.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
};

const GEO_HEADER = 'X-Wordaholic-Geo';
const IMPORT_MAX_BYTES = 1024 * 1024;
const PLAY_MAX_BYTES = 64 * 1024;

/**
 * @param {Request} request
 */
function clientIp(request) {
  const cf = (request.headers.get('CF-Connecting-IP') || '').trim();
  if (cf) return cf.replace(/^::ffff:/i, '');
  const forwarded = request.headers.get('X-Forwarded-For') || '';
  const first = forwarded.split(',')[0].trim();
  return first.replace(/^::ffff:/i, '') || '-';
}

/**
 * @param {Request} request
 */
function geoFromCf(request) {
  const cf = request.cf && typeof request.cf === 'object' ? request.cf : {};
  return normalizeGeo({
    country: cf.country || request.headers.get('CF-IPCountry') || '',
    city: cf.city || '',
    region: cf.region || '',
    asOrg: cf.asOrganization || cf.asOrg || '',
  });
}

/**
 * Local wrangler has no Cloudflare city. A development place is used only when
 * the Worker itself is on localhost.
 * @param {Request} request
 * @param {{ LOCAL_GEO?: string }} env
 */
function edgeGeo(request, env) {
  const fromCf = geoFromCf(request);
  if (fromCf) return fromCf;
  const host = new URL(request.url).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]') return null;
  if (!env.LOCAL_GEO) return null;
  try {
    return normalizeGeo(JSON.parse(env.LOCAL_GEO));
  } catch {
    return null;
  }
}

/**
 * Durable Object fetches drop request.cf. Copy the edge place onto the URL.
 * @param {Request} request
 * @param {{ LOCAL_GEO?: string }} env
 */
function requestWithEdgeGeo(request, env) {
  const headers = new Headers(request.headers);
  headers.delete(GEO_HEADER);
  const method = request.method || 'GET';
  if (method !== 'POST') return new Request(request, { headers });
  const geo = edgeGeo(request, env);
  const url = new URL(request.url);
  url.searchParams.delete('wh_geo');
  if (geo) {
    url.searchParams.set('wh_geo', JSON.stringify(geo));
    headers.set(GEO_HEADER, JSON.stringify(geo));
  }
  return new Request(url, {
    method,
    headers,
    body: request.body,
    duplex: 'half',
  });
}

/**
 * @param {Request} request
 */
function geoFromRequest(request) {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get('wh_geo');
  if (fromQuery) {
    try {
      const parsed = normalizeGeo(JSON.parse(fromQuery));
      if (parsed) return parsed;
    } catch {
      /* fall through */
    }
  }
  const raw = request.headers.get(GEO_HEADER);
  if (raw) {
    try {
      const parsed = normalizeGeo(JSON.parse(raw));
      if (parsed) return parsed;
    } catch {
      /* fall through */
    }
  }
  return geoFromCf(request);
}

/**
 * @param {Request} request
 * @param {number} maxBytes
 */
async function readJson(request, maxBytes) {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > maxBytes) return { error: 413 };
  let raw;
  try {
    raw = await request.text();
  } catch {
    return { error: 400 };
  }
  if (raw.length > maxBytes) return { error: 413 };
  try {
    return { body: JSON.parse(raw || '{}') };
  } catch {
    return { error: 400 };
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function edgeFields(request) {
  const geo = geoFromRequest(request) || { country: '', city: '', region: '', asOrg: '' };
  return {
    ip: clientIp(request),
    country: geo.country || '',
    region: geo.region || '',
    city: geo.city || '',
    asOrg: geo.asOrg || '',
  };
}

export class StatsStore {
  /**
   * @param {DurableObjectState} ctx
   * @param {{ STATS_IMPORT_TOKEN?: string, LOCAL_GEO?: string }} env
   */
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    this.ready = ctx.blockConcurrencyWhile(async () => {
      ensureSchema(this.sql);
    });
  }

  async statsInputs() {
    const tables = loadTableRows(this.sql);
    return statsInputsFromTables({ ...tables, cutover: getCutover(this.sql) });
  }

  /**
   * @param {Request} request
   */
  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);
    const path = canonicalPath(url.pathname);
    const method = request.method || 'GET';

    if (path === '/api/player') return this.player(request, method);
    if (path === '/api/plays') return this.plays(request, method);
    if (path === '/api/scoreboard/catalog') return this.catalog(method);
    if (path === '/api/scoreboard') return this.scoreboard(url, method);
    if (path === '/api/stats/import') return this.importStats(request, method);
    if (path === '/stats') return this.statsPage(url, method);
    if (path === '/api/stats/geo') return this.geo(url, method);
    if (path === '/api/stats') return this.statsApi(request, method);
    return new Response('Not found', { status: 404 });
  }

  /**
   * @param {Request} request
   * @param {string} method
   */
  async player(request, method) {
    if (method === 'GET') {
      const url = new URL(request.url);
      const browserId = parseBrowserId(url.searchParams.get('browserId'));
      if (!browserId) return new Response('Invalid browser', { status: 400 });
      const nick = browserNickname(this.sql, browserId);
      return json({ nickname: nick ? nick.nickname : null });
    }
    if (method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const read = await readJson(request, 2048);
    if (read.error) return new Response(read.error === 413 ? 'Payload too large' : 'Bad request', { status: read.error });
    const body = /** @type {Record<string, unknown>} */ (read.body);
    const browserId = parseBrowserId(body.browserId);
    const action = body.action;
    if (!browserId || (action !== 'set' && action !== 'join' && action !== 'clear')) {
      return new Response('Invalid player', { status: 400 });
    }
    if (action === 'clear') return json(changeNickname(this.sql, browserId, 'clear'));
    const parsed = parseNickname(body.nickname);
    if (!parsed) return new Response('Invalid nickname', { status: 400 });
    const result = changeNickname(this.sql, browserId, action === 'join' ? 'join' : 'set', parsed.display);
    if (!result.ok) return json({ error: 'taken', suggestions: result.suggestions }, 409);
    return json({ nickname: result.nickname });
  }

  /**
   * @param {Request} request
   * @param {string} method
   */
  async plays(request, method) {
    if (method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const read = await readJson(request, PLAY_MAX_BYTES);
    if (read.error) return new Response(read.error === 413 ? 'Payload too large' : 'Bad request', { status: read.error });
    const body = read.body;
    const list = Array.isArray(body)
      ? body
      : body && typeof body === 'object' && Array.isArray(/** @type {{ reports?: unknown }} */ (body).reports)
        ? /** @type {{ reports: unknown[] }} */ (body).reports
        : [body];
    if (list.length > 50) return new Response('Too many reports', { status: 400 });
    const now = Date.now();
    const edge = edgeFields(request);
    /** @type {{ ok: boolean }[]} */
    const results = [];
    for (const item of list) {
      const parsed = parsePlayReport(item, now);
      if (!parsed.ok) {
        results.push({ ok: false });
        continue;
      }
      applyPlay(this.sql, parsed.report, edge);
      results.push({ ok: true });
    }
    return json({ results });
  }

  /**
   * @param {string} method
   */
  catalog(method) {
    if (method !== 'GET' && method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    return json({ combinations: catalogRows(this.sql) });
  }

  /**
   * @param {URL} url
   * @param {string} method
   */
  scoreboard(url, method) {
    if (method !== 'GET' && method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    const gameId = Number(url.searchParams.get('game'));
    const game = playGame(gameId);
    const language = String(url.searchParams.get('language') || '').toLowerCase();
    const variant = String(url.searchParams.get('variant') || '');
    const board = url.searchParams.get('board') === 'best' ? 'best' : 'average';
    const from = String(url.searchParams.get('from') || '');
    const to = String(url.searchParams.get('to') || '');
    const limit = Number(url.searchParams.get('limit') || 3);
    if (!game || !variantAllowed(gameId, variant) || !/^[a-z]{2,8}$/.test(language)) {
      return new Response('Invalid board', { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      return new Response('Invalid dates', { status: 400 });
    }
    if (board === 'best' && !game.boards.includes('best')) return new Response('Invalid board', { status: 400 });
    const finishes = boardFinishes(this.sql, gameId, language, variant, from, to);
    const aggregated = aggregateBoard(finishes, gameId, board);
    const browserId = parseBrowserId(url.searchParams.get('browserId'));
    let selfKey = '';
    if (browserId) {
      ensureBrowser(this.sql, browserId);
      const nick = browserNickname(this.sql, browserId);
      if (nick) selfKey = nick.nameKey;
    }
    const ranked = rankBoard(aggregated, { lowerBetter: game.lowerBetter, limit, selfKey });
    return json(ranked);
  }

  async alarm() {}

  /**
   * @param {Request} request
   * @param {string} method
   */
  async importStats(request, method) {
    if (method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const expected = this.env.STATS_IMPORT_TOKEN || '';
    const header = request.headers.get('Authorization') || '';
    if (!expected || header !== `Bearer ${expected}`) return new Response('Not found', { status: 404 });
    const read = await readJson(request, IMPORT_MAX_BYTES);
    if (read.error) return new Response(read.error === 413 ? 'Payload too large' : 'Bad request', { status: read.error });
    const body = /** @type {Record<string, unknown>} */ (read.body);
    const cutover = typeof body.cutover === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.cutover)
      ? body.cutover
      : new Date().toISOString().slice(0, 10);
    const chosen = setCutoverIfEmpty(this.sql, cutover) || cutover;
    const places = importPlaces(this.sql, /** @type {{ places?: Record<string, never> }} */ (body.places || {}));
    const days = Array.isArray(body.days) ? body.days : [];
    const frozen = importFrozenDays(this.sql, /** @type {never[]} */ (days), chosen);
    return json({ cutover: chosen, places, frozen });
  }

  /**
   * @param {URL} url
   * @param {string} method
   */
  async statsPage(url, method) {
    if (method !== 'GET' && method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    const inputs = await this.statsInputs();
    const range = parseDateRange(url.searchParams.get('from') || '', url.searchParams.get('to') || '');
    const rows = combineBodies(inputs, range);
    const found = await lookupMissingGeos(rows);
    for (const [ip, geo] of found) fillLiveGeo(this.sql, ip, geo);
    const trends = combineTrends(inputs, range, parseTrendInterval(url.searchParams.get('interval')), {
      allowIds: trendIdentityAllowIds(rows, url.searchParams),
      allowLanguages: trendLanguageAllow(url.searchParams),
    });
    const html = renderStatsHtml({
      rows,
      trends,
      from: url.searchParams.get('from') || '',
      to: url.searchParams.get('to') || '',
      params: url.searchParams,
    });
    return new Response(method === 'HEAD' ? null : html, { status: 200, headers: HTML_HEADERS });
  }

  /**
   * @param {URL} url
   * @param {string} method
   */
  async geo(url, method) {
    if (method !== 'GET' && method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    const inputs = await this.statsInputs();
    const places = loadPlacesDocument(this.sql);
    const payload = await buildStatsGeoPayload(
      inputs,
      url.searchParams.get('from') || '',
      url.searchParams.get('to') || '',
      places
    );
    return new Response(method === 'HEAD' ? null : JSON.stringify(payload), { status: 200, headers: JSON_HEADERS });
  }

  /**
   * @param {Request} request
   * @param {string} method
   */
  async statsApi(request, method) {
    if (method === 'GET') {
      return json({ cutover: getCutover(this.sql) });
    }
    if (method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const read = await readJson(request, BODY_MAX_BYTES);
    if (read.error) {
      return new Response(read.error === 413 ? 'Payload too large' : 'Bad request', { status: read.error });
    }
    const parsed = parseStatsDelta(read.body);
    if (!parsed.ok) return new Response('Invalid stats payload', { status: 400 });
    const day = new Date().toISOString().slice(0, 10);
    const edge = edgeFields(request);
    addLiveDay(
      this.sql,
      edge.ip,
      day,
      { homeHits: parsed.delta.homeHits, languages: parsed.delta.languages },
      edge.country || edge.city || edge.region || edge.asOrg ? edge : null
    );
    return new Response(null, { status: 204 });
  }
}

export default {
  /**
   * @param {Request} request
   * @param {{ STATS: DurableObjectNamespace, LOCAL_GEO?: string, STATS_IMPORT_TOKEN?: string }} env
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!isStatsWorkerPath(url.pathname)) return new Response('Not found', { status: 404 });
    const id = env.STATS.idFromName('site');
    return env.STATS.get(id).fetch(requestWithEdgeGeo(request, env));
  },
};
