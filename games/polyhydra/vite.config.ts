import { defineConfig, type Plugin } from 'vite';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const PW_DICT = path.join(repoRoot, 'games/polywordlot/dict');

function polywordlotDictPlugin(): Plugin {
  return {
    name: 'serve-polywordlot-dict',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0];
        if (!url.startsWith('/games/polywordlot/dict/')) return next();
        const rel = decodeURIComponent(url.slice('/games/polywordlot/dict/'.length));
        const file = path.resolve(PW_DICT, rel);
        const fromRoot = path.relative(PW_DICT, file);
        if (fromRoot.startsWith('..') || path.isAbsolute(fromRoot) || !fs.existsSync(file)) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

function shellDataPlugin(): Plugin {
  const wordDataRoot = path.resolve(repoRoot, 'word-data');
  return {
    name: 'polyhydra-shell-data',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0];
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
        const staticRoots = [
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
          const types = { '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };
          res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
          fs.createReadStream(file).pipe(res);
          return;
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
  plugins: [react(), polywordlotDictPlugin(), shellDataPlugin()],
  base: '/games/polyhydra/',
  resolve: {
    alias: {
      '@wordaholic/locales': path.resolve(repoRoot, 'app/shell/locales.js'),
      '@wordaholic/normalize': path.resolve(repoRoot, 'app/i18n/normalize.js'),
      '@wordaholic/storage': path.resolve(repoRoot, 'app/storage/idb.js'),
      '@wordaholic/help': path.resolve(repoRoot, 'app/help/dialog.js'),
      '@wordaholic/stats': path.resolve(repoRoot, 'app/stats/report.js'),
      '@wordaholic/updates': path.resolve(repoRoot, 'app/updates/manifest.js'),
      '@wordaholic/wordle-core': path.resolve(repoRoot, 'packages/wordle-core/src/index.ts'),
    },
  },
  define: {
    __GIT_COMMIT_HASH__: JSON.stringify(getGitCommitHash()),
  },
  build: {
    outDir: path.resolve(repoRoot, 'dist/games/polyhydra'),
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5175,
    fs: {
      allow: [repoRoot],
    },
  },
});
