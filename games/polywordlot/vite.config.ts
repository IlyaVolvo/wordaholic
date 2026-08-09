import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getGitCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  base: '/games/polywordlot/',
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
