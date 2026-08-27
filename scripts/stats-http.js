const BODY_MAX_BYTES = 8 * 1024;
const MAX_HOME_HITS = 100;
const MAX_KEYS = 32;
const MAX_COUNT = 100;
const LANG_RE = /^[a-z]{2,8}$/;
const POLYWORDLOT_KEY_RE = /^[a-z]{2,8},\d{1,2}$/;
const TRANSWORD_KEY_RE = /^[a-z]{2,8},\d{1,2},\d{1,2}$/;
const KEY_MAX_LEN = 32;

const GAME_KEY_RE = {
  polywordlot: POLYWORDLOT_KEY_RE,
  transword: TRANSWORD_KEY_RE,
};

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {number} maxBytes
 */
function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        const err = new Error('payload too large');
        err.code = 'TOO_LARGE';
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * @param {unknown} value
 * @param {RegExp} keyRe
 * @returns {Record<string, number>|null}
 */
function parseCountMap(value, keyRe) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > MAX_KEYS) return null;
  /** @type {Record<string, number>} */
  const out = {};
  for (const [key, raw] of entries) {
    if (typeof key !== 'string' || key.length > KEY_MAX_LEN || !keyRe.test(key)) return null;
    if (!Number.isInteger(raw) || raw < 0 || raw > MAX_COUNT) return null;
    if (raw === 0) continue;
    out[key] = raw;
  }
  return out;
}

/**
 * @param {unknown} body
 * @returns {{ ok: true, delta: {
 *   homeHits?: number,
 *   languages?: Record<string, number>,
 *   games?: { polywordlot?: Record<string, number>, transword?: Record<string, number> },
 * } } | { ok: false }}
 */
export function parseStatsDelta(body) {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) return { ok: false };
  /** @type {{
   *   homeHits?: number,
   *   languages?: Record<string, number>,
   *   games?: { polywordlot?: Record<string, number>, transword?: Record<string, number> },
   * }} */
  const delta = {};

  if ('homeHits' in body) {
    const n = /** @type {{ homeHits?: unknown }} */ (body).homeHits;
    if (!Number.isInteger(n) || n < 0 || n > MAX_HOME_HITS) return { ok: false };
    if (n > 0) delta.homeHits = n;
  }

  if ('languages' in body) {
    const languages = parseCountMap(/** @type {{ languages?: unknown }} */ (body).languages, LANG_RE);
    if (!languages) return { ok: false };
    if (Object.keys(languages).length) delta.languages = languages;
  }

  if ('games' in body) {
    const games = /** @type {{ games?: unknown }} */ (body).games;
    if (games == null || typeof games !== 'object' || Array.isArray(games)) return { ok: false };
    /** @type {{ polywordlot?: Record<string, number>, transword?: Record<string, number> }} */
    const outGames = {};
    for (const gameId of Object.keys(games)) {
      if (!(gameId in GAME_KEY_RE)) return { ok: false };
    }
    for (const gameId of /** @type {const} */ (['polywordlot', 'transword'])) {
      if (!(gameId in games)) continue;
      const counts = parseCountMap(games[gameId], GAME_KEY_RE[gameId]);
      if (!counts) return { ok: false };
      if (Object.keys(counts).length) outGames[gameId] = counts;
    }
    if (Object.keys(outGames).length) delta.games = outGames;
  }

  return { ok: true, delta };
}

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function text(res, status, message, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...extraHeaders });
  res.end(message);
}

/**
 * @param {ReturnType<import('./stats-store.js').createStatsStore>} store
 */
export function createStatsHandler(store) {
  /**
   * @param {import('node:http').IncomingMessage} req
   * @param {import('node:http').ServerResponse} res
   * @param {string} ip
   */
  return async function handleStats(req, res, ip) {
    store.prune();
    const method = req.method || 'GET';

    if (method === 'GET') {
      json(res, 200, store.dump());
      return;
    }

    if (method !== 'POST') {
      text(res, 405, 'Method not allowed', { Allow: 'GET, POST' });
      return;
    }

    let raw;
    try {
      raw = await readBody(req, BODY_MAX_BYTES);
    } catch (err) {
      if (err && err.code === 'TOO_LARGE') {
        text(res, 413, 'Payload too large');
        return;
      }
      text(res, 400, 'Bad request');
      return;
    }

    let body;
    try {
      body = JSON.parse(raw.toString('utf8') || '{}');
    } catch {
      text(res, 400, 'Invalid JSON');
      return;
    }

    const parsed = parseStatsDelta(body);
    if (!parsed.ok) {
      text(res, 400, 'Invalid stats payload');
      return;
    }

    store.merge(ip, parsed.delta);
    res.writeHead(204);
    res.end();
  };
}
