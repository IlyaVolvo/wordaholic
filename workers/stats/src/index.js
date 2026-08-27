import { BODY_MAX_BYTES, parseStatsDelta } from '../../../scripts/stats-delta.js';
import { createStatsStore, PRUNE_INTERVAL_MS } from '../../../scripts/stats-store.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
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

export class StatsStore {
  /**
   * @param {DurableObjectState} ctx
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.store = createStatsStore();
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const snapshot = await ctx.storage.get('dump');
      if (snapshot) this.store.hydrate(snapshot);
      const alarm = await ctx.storage.getAlarm();
      if (alarm == null) {
        await ctx.storage.setAlarm(Date.now() + PRUNE_INTERVAL_MS);
      }
    });
  }

  async persist() {
    await this.ctx.storage.put('dump', this.store.dump());
  }

  /**
   * @param {Request} request
   */
  async fetch(request) {
    await this.ready;
    const method = request.method || 'GET';

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

    this.store.merge(clientIp(request), parsed.delta);
    await this.persist();
    return new Response(null, { status: 204 });
  }

  async alarm() {
    await this.ready;
    this.store.prune();
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
    if (url.pathname !== '/api/stats') {
      return new Response('Not found', { status: 404 });
    }
    const id = env.STATS.idFromName('site');
    return env.STATS.get(id).fetch(request);
  },
};
