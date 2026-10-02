/**
 * Copy TransWord into dist/ for local serve (4173).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { embedAdminPassword } from './embed-admin-password.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(ROOT, 'games/transword');
const dest = path.join(ROOT, 'dist/games/transword');
fs.cpSync(src, dest, { recursive: true });
embedAdminPassword(path.join(dest, 'admin'));
console.log('Copied TransWord → dist/games/transword');
