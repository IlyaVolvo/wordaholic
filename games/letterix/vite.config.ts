import { defineConfig, type Plugin } from 'vite';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const dictRoot = path.join(__dirname, 'dict');

function letterixDictPlugin(): Plugin {
  const serve = (url: string, res: import('node:http').ServerResponse, next: () => void) => {
    const prefix = '/games/letterix/dict/';
    if (!url.startsWith(prefix)) return next();
    const rel = decodeURIComponent(url.slice(prefix.length));
    const file = path.resolve(dictRoot, rel);
    const fromRoot = path.relative(dictRoot, file);
    if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    fs.createReadStream(file).pipe(res);
  };
  return {
    name: 'letterix-dict',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        serve((req.url || '').split('?')[0], res, next);
      });
    },
    closeBundle() {
      const out = path.resolve(repoRoot, 'dist/games/letterix/dict');
      fs.cpSync(dictRoot, out, { recursive: true });
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
        next();
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
  plugins: [react(), letterixDictPlugin(), shellDataPlugin()],
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
