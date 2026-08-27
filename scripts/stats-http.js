import { BODY_MAX_BYTES, parseStatsDelta } from './stats-delta.js';

export { BODY_MAX_BYTES, parseStatsDelta };

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
