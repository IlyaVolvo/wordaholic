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

function getGitCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

export default defineConfig({
  root: __dirname,
  plugins: [react(), copyDictPlugin()],
  base: '/games/polywordlot/',
  resolve: {
    alias: {
      '@wordaholic/locales': path.resolve(__dirname, '../../app/shell/locales.js'),
      '@wordaholic/normalize': path.resolve(__dirname, '../../app/i18n/normalize.js'),
      '@wordaholic/storage': path.resolve(__dirname, '../../app/storage/idb.js'),
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
  },
});
