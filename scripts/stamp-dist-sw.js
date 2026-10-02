/**
 * Bust the dist service-worker shell cache after a game rebuild
 * so local serve (4173) picks up new assets.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const swPath = path.join(dist, 'sw.js');
if (!fs.existsSync(swPath)) process.exit(0);
const name = `wordaholic-shell-${Date.now()}`;
const src = fs.readFileSync(swPath, 'utf8').replace(
  /const CACHE_SHELL = ['"][^'"]+['"]/,
  `const CACHE_SHELL = '${name}'`
);
fs.writeFileSync(swPath, src);
console.log(`Stamped dist/sw.js ${name}`);
