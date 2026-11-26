/**
 * Record one silent deep video per showcase scene.
 * The site must already be running: npm run serve
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { scenes } from '../showcase/registry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'showcase', 'movies');
const BASE = process.env.SHOWCASE_URL || 'http://127.0.0.1:4173';

function sceneUrl(scene) {
  const url = new URL(scene.start, BASE);
  url.searchParams.set('showcase', '1');
  url.searchParams.set('scene', scene.id);
  url.searchParams.set('detail', 'deep');
  return url.href;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const scene of scenes) {
      const dir = fs.mkdtempSync(path.join(OUT, `.${scene.id}-`));
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        recordVideo: { dir, size: { width: 1280, height: 800 } },
        acceptDownloads: true,
      });
      const page = await context.newPage();
      console.log(`Recording ${scene.id}`);
      await page.goto(sceneUrl(scene), { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => document.documentElement.dataset.showcase === 'done'
          || document.documentElement.dataset.showcase === 'error',
        null,
        { timeout: 180000 }
      );
      const failed = await page.evaluate(() => window.__showcaseError || '');
      const video = page.video();
      await context.close();
      const recorded = video ? await video.path() : '';
      const dest = path.join(OUT, `${scene.id}.webm`);
      if (recorded) fs.copyFileSync(recorded, dest);
      fs.rmSync(dir, { recursive: true, force: true });
      if (failed) throw new Error(`${scene.id}: ${failed}`);
      console.log(`Wrote ${dest}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
