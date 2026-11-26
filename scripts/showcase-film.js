/**
 * Concatenate the deep scene videos and lay showcase/music/theme.mp3 under them.
 * Regenerating the clips does not touch the music file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scenes } from '../showcase/registry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOVIES = path.join(ROOT, 'showcase', 'movies');
const MUSIC = path.join(ROOT, 'showcase', 'music', 'theme.mp3');
const OUT = path.join(MOVIES, 'wordaholic.mp4');

function main() {
  if (!fs.existsSync(MUSIC)) {
    throw new Error('Place your track at showcase/music/theme.mp3 and run this again.');
  }
  const clips = scenes.map((scene) => path.join(MOVIES, `${scene.id}.webm`));
  const missing = clips.filter((file) => !fs.existsSync(file));
  if (missing.length) {
    throw new Error(`Missing scene videos. Run npm run showcase:record first.\n${missing.join('\n')}`);
  }
  const list = path.join(MOVIES, 'concat.txt');
  fs.mkdirSync(MOVIES, { recursive: true });
  fs.writeFileSync(
    list,
    clips.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join('\n')
  );
  const result = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', list,
      '-stream_loop', '-1',
      '-i', MUSIC,
      '-shortest',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      OUT,
    ],
    { stdio: 'inherit' }
  );
  fs.rmSync(list, { force: true });
  if (result.error) throw new Error('ffmpeg is required to build the film.');
  if (result.status) throw new Error(`ffmpeg exited ${result.status}`);
  console.log(`Wrote ${OUT}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
