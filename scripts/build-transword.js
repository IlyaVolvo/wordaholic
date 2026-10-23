/**
 * Copy TransWord (static) plus its group's shared/ and data/ into dist/ for local serve (4173).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { embedAdminPassword } from './embed-admin-password.js';
import { writeGamesLayout } from './games-layout.js';
import { gameGroup } from '../app/games-contract.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
writeGamesLayout();
const group = gameGroup('transword');
for (const part of ['transword', 'shared', 'data']) {
  fs.cpSync(path.join(ROOT, 'games', group, part), path.join(ROOT, 'dist/games', group, part), { recursive: true });
}
embedAdminPassword(path.join(ROOT, 'dist/games', group, 'transword/admin'));
console.log(`Copied TransWord → dist/games/${group}`);
