import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isStatsWorkerPath } from './stats-path.js';
import { gameGroup } from '../app/games-contract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../dist');
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '0.0.0.0';
const WORKER_ORIGIN = process.env.STATS_WORKER_ORIGIN || 'http://127.0.0.1:8787';

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
 * Stats, plays, nicknames, and the scoreboard are the Cloudflare Worker.
 * This process only forwards those routes to the local Worker.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
async function proxyWorker(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');
  const target = new URL(`${url.pathname}${url.search}`, WORKER_ORIGIN);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value == null || key === 'host' || key === 'connection') continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  headers.set('X-Forwarded-For', clientIp(req));
  headers.set('CF-Connecting-IP', clientIp(req));
  /** @type {Buffer | undefined} */
  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = Buffer.concat(chunks);
  }
  try {
    const upstream = await fetch(target, { method: req.method, headers, body });
    res.statusCode = upstream.status;
    upstream.headers.forEach((value, key) => {
      if (key === 'transfer-encoding' || key === 'content-encoding' || key === 'content-length') return;
      res.setHeader(key, value);
    });
    const bytes = Buffer.from(await upstream.arrayBuffer());
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Stats worker is not running. Start it with npm run dev:stats');
  }
}

/**
 * Pre-group URLs: /games/<id>/… → /games/<group>/<id>/…, and /games/<id>/data/… → /games/<group>/data/….
 * @param {string} urlPath
 * @returns {string | null}
 */
function legacyGameRedirect(urlPath) {
  const match = /^\/games\/([^/]+)(\/.*)?$/.exec(urlPath);
  if (!match) return null;
  const group = gameGroup(match[1]);
  if (!group) return null;
  const rest = match[2] || '/';
  if (rest.startsWith('/data/')) return `/games/${group}${rest}`;
  return `/games/${group}/${match[1]}${rest}`;
}

const server = http.createServer((req, res) => {
  res.on('finish', () => logAccess(req, res));
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (isStatsWorkerPath(urlPath)) {
    void proxyWorker(req, res);
    return;
  }
  const moved = legacyGameRedirect(urlPath);
  if (moved) {
    const query = (req.url || '').includes('?') ? (req.url || '').slice((req.url || '').indexOf('?')) : '';
    res.writeHead(301, { Location: `${moved}${query}` });
    res.end();
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
  if (
    urlPath === '/sw.js' ||
    urlPath.startsWith('/games/g2/transword/admin') ||
    /^\/games\/g\d+\/[^/]+\/(index\.html)?$/.test(urlPath) ||
    urlPath.includes('/games/') && urlPath.includes('/assets/')
  ) {
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
