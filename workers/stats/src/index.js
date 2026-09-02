import { BODY_MAX_BYTES, parseStatsDelta } from '../../../scripts/stats-delta.js';
import { archiveClosedHours } from '../../../scripts/stats-archive.js';
import { gcsConfigured, getGcsObject, listGcsKeys } from '../../../scripts/gcs-xml-put.js';
import { createStatsStore, PRUNE_INTERVAL_MS } from '../../../scripts/stats-store.js';
import { combineBodies, combineTrends, normalizeGeo, parseDateRange, parseTrendInterval } from '../../../scripts/stats-combine.js';
import { isStatsApiPath, isStatsPagePath } from '../../../scripts/stats-path.js';
import { renderStatsHtml } from '../../../scripts/stats-page.js';
import { HOUR_PULL_BATCH, HOUR_STORAGE_GET_BATCH, hourFromObjectKey } from '../../../scripts/stats-hour-cache.js';
import { lookupMissingGeos } from '../../../scripts/stats-geo-lookup.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
};

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

/** Set only by this Worker; stripped if a client sends it. */
const GEO_HEADER = 'X-Wordaholic-Geo';

/**
 * Cloudflare geo on the *edge* request. Durable Object fetches do not keep
 * `request.cf`, so the Worker copies it into GEO_HEADER before forwarding.
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
      /* fall through to cf, if any */
    }
  }
  return geoFromCf(request);
}

/**
 * Durable Object fetches drop request.cf. Put edge geo on the URL for POSTs.
 * @param {Request} request
 */
function requestWithEdgeGeo(request) {
  const headers = new Headers(request.headers);
  headers.delete(GEO_HEADER);
  const method = request.method || 'GET';
  if (method !== 'POST') {
    return new Request(request, { headers });
  }
  const geo = geoFromCf(request);
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
 * @param {{ GCS_BUCKET?: string, GCS_HMAC_ACCESS_KEY?: string, GCS_HMAC_SECRET?: string }} env
 */
function gcsCreds(env) {
  return {
    accessKey: env.GCS_HMAC_ACCESS_KEY,
    secret: env.GCS_HMAC_SECRET,
    bucket: env.GCS_BUCKET,
  };
}

export class StatsStore {
  /**
   * @param {DurableObjectState} ctx
   * @param {{
   *   GCS_BUCKET?: string,
   *   GCS_HMAC_ACCESS_KEY?: string,
   *   GCS_HMAC_SECRET?: string,
   * }} env
   */
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.store = createStatsStore({ requireArchivedForPrune: true });
    /** @type {Set<string>} */
    this.hourCacheIndex = new Set();
    /** @type {Map<string, unknown>} */
    this.hourBodies = new Map();
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const snapshot = await ctx.storage.get('dump');
      if (snapshot) this.store.hydrate(snapshot);
      const index = await ctx.storage.get('hourCacheIndex');
      if (Array.isArray(index)) {
        for (const hour of index) {
          if (typeof hour === 'string' && hour) this.hourCacheIndex.add(hour);
        }
      }
      const alarm = await ctx.storage.getAlarm();
      if (alarm == null) {
        await ctx.storage.setAlarm(Date.now() + PRUNE_INTERVAL_MS);
      }
    });
  }

  async persist() {
    await this.ctx.storage.put('dump', this.store.snapshot());
  }

  /**
   * @param {string} hour
   * @param {unknown} body
   */
  async putHourCache(hour, body) {
    if (!hour || this.hourCacheIndex.has(hour)) return;
    this.hourCacheIndex.add(hour);
    this.hourBodies.set(hour, body);
    await this.ctx.storage.put({
      [`hour:${hour}`]: body,
      hourCacheIndex: [...this.hourCacheIndex].sort(),
    });
  }

  async loadHourBodies() {
    const missing = [...this.hourCacheIndex].filter((hour) => !this.hourBodies.has(hour));
    for (let i = 0; i < missing.length; i += HOUR_STORAGE_GET_BATCH) {
      const chunk = missing.slice(i, i + HOUR_STORAGE_GET_BATCH);
      const got = await this.ctx.storage.get(chunk.map((hour) => `hour:${hour}`));
      for (const hour of chunk) {
        const body = got.get(`hour:${hour}`);
        if (body) this.hourBodies.set(hour, body);
      }
    }
  }

  /**
   * @param {number} [limit]
   * @returns {Promise<{ fetched: number, remaining: number }>}
   */
  async fillHourCacheFromGcs(limit = HOUR_PULL_BATCH) {
    if (!gcsConfigured(this.env)) return { fetched: 0, remaining: 0 };
    const creds = gcsCreds(this.env);
    let keys;
    try {
      keys = (await listGcsKeys({ ...creds, prefix: 'hours/' })).filter((key) => key.endsWith('.json'));
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      return { fetched: 0, remaining: 0 };
    }
    /** @type {string[]} */
    const missing = [];
    for (const key of keys) {
      const hour = hourFromObjectKey(key);
      if (!hour || this.hourCacheIndex.has(hour)) continue;
      missing.push(key);
    }
    let fetched = 0;
    for (const key of missing.slice(0, limit)) {
      const hour = hourFromObjectKey(key);
      try {
        const text = await getGcsObject({ ...creds, objectKey: key });
        const body = JSON.parse(text);
        await this.putHourCache(hour, body);
        fetched += 1;
      } catch (err) {
        console.error(err instanceof Error ? err.message : err);
      }
    }
    return { fetched, remaining: Math.max(0, missing.length - fetched) };
  }

  /**
   * @param {Request} request
   */
  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);
    const method = request.method || 'GET';

    if (isStatsPagePath(url.pathname) && (method === 'GET' || method === 'HEAD')) {
      const fill = await this.fillHourCacheFromGcs();
      await this.loadHourBodies();
      const range = parseDateRange(url.searchParams.get('from') || '', url.searchParams.get('to') || '');
      /** @type {{ source: string, body: unknown }[]} */
      const inputs = [{ source: 'live', body: this.store.dump() }];
      for (const [hour, body] of this.hourBodies) {
        inputs.push({ source: `hour:${hour}`, body });
      }
      const rows = combineBodies(inputs, range);
      const trends = combineTrends(inputs, range, parseTrendInterval(url.searchParams.get('interval')));
      const found = await lookupMissingGeos(rows);
      for (const [ip, geo] of found) this.store.rememberGeo(ip, geo);
      if (found.size) await this.persist();
      const html = renderStatsHtml({
        rows,
        trends,
        from: url.searchParams.get('from') || '',
        to: url.searchParams.get('to') || '',
        params: url.searchParams,
        backfillRemaining: fill.remaining,
      });
      return new Response(method === 'HEAD' ? null : html, { status: 200, headers: HTML_HEADERS });
    }

    if (!isStatsApiPath(url.pathname)) {
      return new Response('Not found', { status: 404 });
    }

    if (method === 'GET') {
      return Response.json(this.store.dump(), { headers: JSON_HEADERS });
    }

    if (method !== 'POST') {
      return new Response('Method not allowed', {
        status: 405,
        headers: { Allow: 'GET, POST', 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    const declared = Number(request.headers.get('Content-Length'));
    if (Number.isFinite(declared) && declared > BODY_MAX_BYTES) {
      return new Response('Payload too large', { status: 413 });
    }

    let raw;
    try {
      raw = await request.text();
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    if (raw.length > BODY_MAX_BYTES) {
      return new Response('Payload too large', { status: 413 });
    }

    let body;
    try {
      body = JSON.parse(raw || '{}');
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    const parsed = parseStatsDelta(body);
    if (!parsed.ok) {
      return new Response('Invalid stats payload', { status: 400 });
    }

    this.store.merge(clientIp(request), parsed.delta, Date.now(), geoFromRequest(request));
    await this.persist();
    return new Response(null, { status: 204 });
  }

  async alarm() {
    await this.ready;
    if (gcsConfigured(this.env)) {
      const result = await archiveClosedHours(this.store, this.env);
      for (const file of result.files || []) {
        await this.putHourCache(file.hour, { hours: [{ hour: file.hour, ips: file.ips }] });
      }
      await this.fillHourCacheFromGcs();
      this.store.prune();
    } else {
      this.store.prune(Date.now(), { requireArchived: false });
    }
    await this.persist();
    await this.ctx.storage.setAlarm(Date.now() + PRUNE_INTERVAL_MS);
  }
}

export default {
  /**
   * @param {Request} request
   * @param {{ STATS: DurableObjectNamespace }} env
   */
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!isStatsApiPath(url.pathname) && !isStatsPagePath(url.pathname)) {
      return new Response('Not found', { status: 404 });
    }

    const id = env.STATS.idFromName('site');
    return env.STATS.get(id).fetch(requestWithEdgeGeo(request));
  },
};
