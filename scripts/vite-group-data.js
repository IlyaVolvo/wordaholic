import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeGamesLayout } from './games-layout.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TYPES = { '.txt': 'text/plain', '.json': 'application/json', '.js': 'text/javascript' };

/**
 * Serve /games/<group>/data/ and /games/<group>/shared/ from source in dev,
 * and copy the group's data/ into dist after a build.
 * Also refreshes app/games-layout.js so every Vite run sees the current groups.
 * @param {string} gameDir  games/<group>/<game>
 */
export function groupDataPlugin(gameDir) {
  writeGamesLayout();
  const groupDir = path.dirname(gameDir);
  const group = path.basename(groupDir);
  return {
    name: 'group-data',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0];
        const prefix = `/games/${group}/`;
        if (!url.startsWith(`${prefix}data/`) && !url.startsWith(`${prefix}shared/`)) return next();
        const rel = decodeURIComponent(url.slice(prefix.length));
        const file = path.resolve(groupDir, rel);
        const fromGroup = path.relative(groupDir, file);
        if (fromGroup.startsWith('..') || path.isAbsolute(fromGroup) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        res.setHeader('Content-Type', `${TYPES[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`);
        fs.createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      const src = path.join(groupDir, 'data');
      if (fs.existsSync(src)) fs.cpSync(src, path.join(ROOT, 'dist/games', group, 'data'), { recursive: true });
    },
  };
}
