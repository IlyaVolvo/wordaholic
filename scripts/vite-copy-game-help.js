import fs from 'node:fs';
import path from 'node:path';

/** Copy files Vite does not emit after it empties dist/games/<id>. */
export function copyGameHelpPlugin(gameDir) {
  const helpSrc = path.join(gameDir, 'help');
  const registrationSrc = path.join(gameDir, 'registration.js');
  const gameId = path.basename(gameDir);
  return {
    name: 'copy-game-help',
    closeBundle() {
      const destDir = path.resolve(gameDir, '../../dist/games', gameId);
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
