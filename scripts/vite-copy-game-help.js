import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Copy files Vite does not emit after it empties dist/games/<group>/<id>. */
export function copyGameHelpPlugin(gameDir) {
  const helpSrc = path.join(gameDir, 'help');
  const registrationSrc = path.join(gameDir, 'registration.js');
  return {
    name: 'copy-game-help',
    closeBundle() {
      const destDir = path.join(ROOT, 'dist', path.relative(ROOT, gameDir));
      fs.mkdirSync(destDir, { recursive: true });
      if (fs.existsSync(registrationSrc)) {
        fs.copyFileSync(registrationSrc, path.join(destDir, 'registration.js'));
      }
      if (fs.existsSync(helpSrc)) {
        fs.cpSync(helpSrc, path.join(destDir, 'help'), { recursive: true });
      }
    },
  };
}
