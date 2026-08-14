import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../dist');
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '0.0.0.0';

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

const server = http.createServer((req, res) => {
  res.on('finish', () => logAccess(req, res));
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
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
