import { defineConfig, type Plugin } from 'vite';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

/** Other games keep their own dev servers. This one also serves the home page. */
const OTHER_DEV_PORTS: Record<string, number> = {
  polywordlot: 5174,
  polyhydra: 5175,
};

function gameIdFromPath(urlPath: string): string | null {
  const match = /^\/games\/([^/]+)(?:\/|$)/.exec(urlPath);
  if (!match || match[1] === 'letterix') return null;
  return match[1];
}

function proxyDevGame(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, port: number) {
  const headers = { ...req.headers, host: `127.0.0.1:${port}` };
  delete headers.connection;
  const proxyReq = http.request(
    { host: '127.0.0.1', port, path: req.url, method: req.method, headers },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on('error', () => {
    if (res.headersSent) return;
    res.statusCode = 502;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(`That game's dev server is not running on port ${port}.`);
  });
  req.pipe(proxyReq);
}

function proxyDevUpgrade(req: import('node:http').IncomingMessage, socket: import('node:stream').Duplex, head: Buffer, port: number) {
  const headers = { ...req.headers, host: `127.0.0.1:${port}` };
  const proxyReq = http.request({
    host: '127.0.0.1',
    port,
    path: req.url,
    method: req.method || 'GET',
    headers,
  });
  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    const lines = [`HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage || ''}`.trimEnd()];
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (value == null) continue;
      for (const item of Array.isArray(value) ? value : [value]) lines.push(`${key}: ${item}`);
    }
    socket.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (proxyHead.length) socket.write(proxyHead);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
    if (head.length) proxySocket.write(head);
  });
  proxyReq.on('error', () => socket.destroy());
  proxyReq.end();
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const languagesRoot = path.join(__dirname, 'data/languages');

function letterixLanguagesPlugin(): Plugin {
  const serve = (url: string, res: import('node:http').ServerResponse, next: () => void) => {
    const prefix = '/games/letterix/data/languages/';
    if (!url.startsWith(prefix)) return next();
    const rel = decodeURIComponent(url.slice(prefix.length));
    const file = path.resolve(languagesRoot, rel);
    const fromRoot = path.relative(languagesRoot, file);
    if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    fs.createReadStream(file).pipe(res);
  };
  return {
    name: 'letterix-languages',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        serve((req.url || '').split('?')[0], res, next);
      });
    },
    closeBundle() {
      const out = path.resolve(repoRoot, 'dist/games/letterix/data/languages');
      fs.cpSync(languagesRoot, out, { recursive: true });
    },
  };
}

function shellDataPlugin(): Plugin {
  const wordDataRoot = path.resolve(repoRoot, 'word-data');
  return {
    name: 'letterix-shell-data',
    enforce: 'pre',
    configureServer(server) {
      const publicRoot = path.join(repoRoot, 'public');
      const send = (res: import('node:http').ServerResponse, file: string) => {
        const ext = path.extname(file);
        const types: Record<string, string> = {
          '.css': 'text/css',
          '.js': 'text/javascript',
          '.svg': 'image/svg+xml',
          '.json': 'application/json',
          '.html': 'text/html',
          '.txt': 'text/plain',
          '.webmanifest': 'application/manifest+json',
        };
        res.setHeader('Content-Type', `${types[ext] || 'application/octet-stream'}; charset=utf-8`);
        fs.createReadStream(file).pipe(res);
      };
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0];
        if (url === '/' || url === '/index.html') {
          send(res, path.join(publicRoot, 'index.html'));
          return;
        }
        if (url === '/data/languages.json') {
          const { buildLanguagesCatalog } = await import('../../scripts/build-languages-catalog.js');
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(buildLanguagesCatalog(), null, 2));
          return;
        }
        const registration = url.match(/^\/games\/([^/]+)\/registration\.js$/);
        if (registration) {
          const gamesRoot = path.resolve(repoRoot, 'games');
          const file = path.resolve(gamesRoot, registration[1], 'registration.js');
          const fromGames = path.relative(gamesRoot, file);
          if (!fromGames.startsWith('..') && !path.isAbsolute(fromGames) && fs.existsSync(file) && fs.statSync(file).isFile()) {
            send(res, file);
            return;
          }
        }
        if (url.startsWith('/word-data/')) {
          const rel = decodeURIComponent(url.slice('/word-data/'.length));
          const file = path.resolve(wordDataRoot, rel);
          const fromRoot = path.relative(wordDataRoot, file);
          if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
            res.statusCode = 404;
            res.end('Not found');
            return;
          }
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          fs.createReadStream(file).pipe(res);
          return;
        }
        const staticRoots: [string, string][] = [
          ['/brand/', path.join(repoRoot, 'public/brand')],
          ['/app/', path.join(repoRoot, 'app')],
          ['/help/', path.join(repoRoot, 'public/help')],
        ];
        for (const [prefix, root] of staticRoots) {
          if (!url.startsWith(prefix)) continue;
          const rel = decodeURIComponent(url.slice(prefix.length));
          const file = path.resolve(root, rel);
          const fromRoot = path.relative(root, file);
          if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
            res.statusCode = 404;
            res.end('Not found');
            return;
          }
          const ext = path.extname(file);
          const types: Record<string, string> = {
            '.css': 'text/css',
            '.js': 'text/javascript',
            '.svg': 'image/svg+xml',
            '.json': 'application/json',
          };
          res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
          fs.createReadStream(file).pipe(res);
          return;
        }
        if (!url.startsWith('/@') && !url.startsWith('/src') && !url.startsWith('/games/') && !url.startsWith('/node_modules') && !url.includes('..')) {
          const rel = decodeURIComponent(url.replace(/^\/+/, ''));
          const file = path.join(publicRoot, rel);
          const fromPublic = path.relative(publicRoot, file);
          if (!fromPublic.startsWith('..') && !path.isAbsolute(fromPublic) && fs.existsSync(file) && fs.statSync(file).isFile()) {
            send(res, file);
            return;
          }
        }
        const gameId = gameIdFromPath(url);
        if (gameId === 'transword') {
          const transwordRoot = path.join(repoRoot, 'games/transword');
          const rel = url === '/games/transword' ? 'index.html' : decodeURIComponent(url.slice('/games/transword/'.length)) || 'index.html';
          let file = path.resolve(transwordRoot, rel);
          const fromRoot = path.relative(transwordRoot, file);
          if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot)) {
            res.statusCode = 404;
            res.end('Not found');
            return;
          }
          if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
          if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
            res.statusCode = 404;
            res.end('Not found');
            return;
          }
          send(res, file);
          return;
        }
        const port = gameId ? OTHER_DEV_PORTS[gameId] : undefined;
        if (port) {
          proxyDevGame(req, res, port);
          return;
        }
        next();
      });
      server.httpServer?.on('upgrade', (req, socket, head) => {
        const pathname = (req.url || '').split('?')[0];
        const gameId = gameIdFromPath(pathname);
        const port = gameId ? OTHER_DEV_PORTS[gameId] : undefined;
        if (!port) return;
        proxyDevUpgrade(req, socket, head, port);
      });
    },
  };
}

function getGitCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

export default defineConfig({
  root: __dirname,
  plugins: [react(), letterixLanguagesPlugin(), shellDataPlugin()],
  base: '/games/letterix/',
  resolve: {
    alias: {
      '@wordaholic/normalize': path.resolve(repoRoot, 'app/i18n/normalize.js'),
      '@wordaholic/i18n-prefs': path.resolve(repoRoot, 'app/i18n-prefs/preferred.js'),
      '@wordaholic/storage': path.resolve(repoRoot, 'app/storage/idb.js'),
      '@wordaholic/help': path.resolve(repoRoot, 'app/help/dialog.js'),
      '@wordaholic/stats': path.resolve(repoRoot, 'app/stats/report.js'),
      '@wordaholic/updates': path.resolve(repoRoot, 'app/updates/manifest.js'),
    },
  },
  define: {
    __GIT_COMMIT_HASH__: JSON.stringify(getGitCommitHash()),
  },
  build: {
    outDir: path.resolve(repoRoot, 'dist/games/letterix'),
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5176,
    fs: {
      allow: [repoRoot],
    },
  },
});
