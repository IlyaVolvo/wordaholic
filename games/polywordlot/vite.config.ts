import { defineConfig, type Plugin } from 'vite';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DICT_SRC = path.join(__dirname, 'dict');

function copyDictPlugin(): Plugin {
  return {
    name: 'copy-polywordlot-dict',
    closeBundle() {
      const dest = path.resolve(__dirname, '../../dist/games/polywordlot/dict');
      fs.cpSync(DICT_SRC, dest, { recursive: true });
    },
  };
}

/** Isolated Vite dev still uses the site catalog and shared language.json files. */
function shellDataPlugin(): Plugin {
  const repoRoot = path.resolve(__dirname, '../..');
  const wordDataRoot = path.resolve(repoRoot, 'word-data');
  return {
    name: 'polywordlot-shell-data',
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
          if (
            fromRoot.startsWith('..') ||
            path.isAbsolute(fromRoot) ||
            !fs.existsSync(file) ||
            !fs.statSync(file).isFile()
          ) {
            res.statusCode = 404;
            res.end('Not found');
            return;
          }
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
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
  plugins: [react(), copyDictPlugin(), shellDataPlugin()],
  base: '/games/polywordlot/',
  resolve: {
    alias: {
      '@wordaholic/locales': path.resolve(__dirname, '../../app/shell/locales.js'),
      '@wordaholic/normalize': path.resolve(__dirname, '../../app/i18n/normalize.js'),
      '@wordaholic/storage': path.resolve(__dirname, '../../app/storage/idb.js'),
      '@wordaholic/help': path.resolve(__dirname, '../../app/help/dialog.js'),
    },
  },
  define: {
    __GIT_COMMIT_HASH__: JSON.stringify(getGitCommitHash()),
  },
  build: {
    outDir: path.resolve(__dirname, '../../dist/games/polywordlot'),
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    fs: {
      allow: [path.resolve(__dirname, '../..')],
    },
  },
});
