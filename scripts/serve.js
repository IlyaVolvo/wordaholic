import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStatsStore, PRUNE_INTERVAL_MS } from './stats-store.js';
import { createStatsHandler } from './stats-http.js';
import { combineBodies, parseDateRange } from './stats-combine.js';
import { renderStatsHtml } from './stats-page.js';
import { isStatsApiPath, isStatsPagePath } from './stats-path.js';
import { lookupMissingGeos } from './stats-geo-lookup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../dist');
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '0.0.0.0';

const statsStore = createStatsStore();
const handleStats = createStatsHandler(statsStore);
const HOURS_DIR = path.resolve(__dirname, '../stats-hours');
setInterval(() => statsStore.prune(), PRUNE_INTERVAL_MS).unref();

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.gz': 'application/gzip',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/**
 * Client IP as seen by the public proxy (Render sets X-Forwarded-For).
 * First hop is the original client; later hops are proxies.
 * @param {import('node:http').IncomingMessage} req
 */
function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const forwardedFirst = (Array.isArray(forwarded) ? forwarded[0] : forwarded || '')
    .split(',')[0]
    .trim();
  const real = req.headers['x-real-ip'];
  const realIp = (Array.isArray(real) ? real[0] : real || '').trim();
  const raw = forwardedFirst || realIp || req.socket.remoteAddress || '';
  return raw.replace(/^::ffff:/i, '') || '-';
}

/**
 * @param {import('node:http').IncomingMessage} req
 */
function requestPath(req) {
  try {
    return new URL(req.url || '/', 'http://localhost').pathname;
  } catch {
    return '/';
  }
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
function logAccess(req, res) {
  console.log(`access ${clientIp(req)} ${req.method || '-'} ${res.statusCode} ${requestPath(req)}`);
}

/** Prefer a private 192.168.x.x address for the printed link. */
function lanAddresses() {
  try {
    const nets = os.networkInterfaces();
    /** @type {string[]} */
    const v4 = [];
    for (const entries of Object.values(nets || {})) {
      for (const net of entries || []) {
        const family = typeof net.family === 'string' ? net.family : String(net.family);
        if ((family === 'IPv4' || family === '4') && !net.internal) {
          v4.push(net.address);
        }
      }
    }
    const preferred = v4.filter((ip) => ip.startsWith('192.168.'));
    return preferred.length ? preferred : v4;
  } catch {
    return [];
  }
}

/**
 * Local /stats: live in-memory dump plus ./stats-hours/*.json (from stats-pull-gcs).
 * GET /api/stats stays the raw JSON dump.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
async function handleStatsPage(req, res) {
  const method = req.method || 'GET';
  if (method !== 'GET' && method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET', 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method not allowed');
    return;
  }
  let url;
  try {
    url = new URL(req.url || '/stats', 'http://localhost');
  } catch {
    url = new URL('/stats', 'http://localhost');
  }
  /** @type {{ source: string, body: unknown }[]} */
  const inputs = [{ source: 'live', body: statsStore.dump() }];
  if (fs.existsSync(HOURS_DIR)) {
    for (const name of fs.readdirSync(HOURS_DIR).filter((n) => n.endsWith('.json')).sort()) {
      const file = path.join(HOURS_DIR, name);
      try {
        inputs.push({ source: file, body: JSON.parse(fs.readFileSync(file, 'utf8')) });
      } catch (err) {
        console.error(err instanceof Error ? err.message : err);
      }
    }
  }
  const range = parseDateRange(url.searchParams.get('from') || '', url.searchParams.get('to') || '');
  const rows = combineBodies(inputs, range);
  await lookupMissingGeos(rows);
      const html = renderStatsHtml({
    rows,
    from: url.searchParams.get('from') || '',
    to: url.searchParams.get('to') || '',
    params: url.searchParams,
  });
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(method === 'HEAD' ? undefined : html);
}

const server = http.createServer((req, res) => {
  res.on('finish', () => logAccess(req, res));
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (isStatsPagePath(urlPath)) {
    void handleStatsPage(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end('Internal error');
      }
    });
    return;
  }
  if (isStatsApiPath(urlPath)) {
    void handleStats(req, res, clientIp(req)).catch((err) => {
      console.error(err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end('Internal error');
      }
    });
    return;
  }
  let filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = path.extname(filePath);
  const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream' };
  if (urlPath === '/sw.js' || urlPath.startsWith('/games/transword/admin')) {
    headers['Cache-Control'] = 'no-store';
  }
  res.writeHead(200, headers);
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, HOST, () => {
  const lans = lanAddresses();
  console.log(`Wordaholic serving ${ROOT}`);
  if (lans.length) {
    for (const ip of lans) {
      console.log(`  http://${ip}:${PORT}`);
    }
  } else {
    console.log(`  http://127.0.0.1:${PORT} (no 192.168.* interface found)`);
  }
});
