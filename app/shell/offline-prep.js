import { getFavoriteLanguages } from '../i18n-prefs/favorites.js';
import { helpScreenshotUrls } from '../help/topics.js';
import { ensureWordsets } from '../words/loader.js';

/**
 * Resolve hashed Vite asset URLs from a built game index.html.
 * @param {string} indexUrl
 * @returns {Promise<string[]>}
 */
async function assetUrlsFromIndex(indexUrl) {
  try {
    const res = await fetch(indexUrl);
    if (!res.ok) return [];
    const html = await res.text();
    const base = indexUrl.replace(/\/[^/]*$/, '/');
    const found = new Set();
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const ref = match[1];
      if (!ref || ref.startsWith('data:')) continue;
      if (ref.startsWith('/')) found.add(ref);
      else if (ref.startsWith('./') || !ref.includes('://')) {
        found.add(new URL(ref, `http://local${base}`).pathname);
      }
    }
    return [...found];
  } catch {
    return [];
  }
}

/**
 * @param {(pct: number, label: string) => void} onProgress
 */
export async function prepareOffline(onProgress) {
  onProgress(5, 'Registering offline worker…');
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      await navigator.serviceWorker.ready;
    } catch (err) {
      console.warn('SW registration failed', err);
    }
  }

  onProgress(20, 'Loading catalog…');
  const langRes = await fetch('/data/languages.json');
  const languages = await langRes.json();
  const favorites = getFavoriteLanguages();
  const favLangs = languages.filter((l) => favorites.includes(l.code));

  onProgress(35, 'Caching application shell…');
  const shellUrls = [
    '/',
    '/index.html',
    '/app.css',
    '/app/main.js',
    '/app/help/help.css',
    '/app/help/dialog.js',
    '/app/help/topics.js',
    '/app/play/portrait-gate.css',
    '/app/play/portrait-gate.js',
    ...helpScreenshotUrls(),
    '/deployment-manifest.json',
    '/app/announcements.json',
    '/data/languages.json',
    '/map/world.svg',
    '/games/polywordlot/index.html',
    '/games/polyhydra/index.html',
    '/games/transword/index.html',
    '/games/transword/game.js',
    '/games/transword/game.css',
    '/games/transword/graph.js',
    '/games/transword/solver.js',
    '/games/transword/data/languages/index.json',
  ];
  const pwAssets = await assetUrlsFromIndex('/games/polywordlot/index.html');
  const phAssets = await assetUrlsFromIndex('/games/polyhydra/index.html');
  await Promise.all([...shellUrls, ...pwAssets, ...phAssets].map((u) => fetch(u).catch(() => null)));

  onProgress(55, 'Caching favorite language dictionaries…');
  const wordUrls = [];
  for (const lang of favLangs) {
    if (lang.wordDir) {
      wordUrls.push(`/word-data/${lang.wordDir}/language.json`);
    }
    if ((lang.games || []).includes('polywordlot') || (lang.games || []).includes('polyhydra')) {
      if (lang.polyDir) {
        const dir = lang.polyDir;
        for (const len of lang.polywordlotLengths || []) {
          wordUrls.push(`/games/polywordlot/dict/${dir}/answers-${len}.txt`);
          wordUrls.push(`/games/polywordlot/dict/${dir}/dictionary-${len}.txt`);
        }
      }
    }
    if ((lang.games || []).includes('transword')) {
      const dir = lang.transwordDir;
      if (dir) {
        wordUrls.push(`/games/transword/data/languages/${dir}/corpus.txt`);
      }
    }
  }

  let done = 0;
  for (const url of wordUrls) {
    try {
      await fetch(url);
    } catch {
      /* optional */
    }
    done += 1;
    const pct = 55 + Math.round((done / Math.max(wordUrls.length, 1)) * 40);
    onProgress(pct, `Caching word data (${done}/${wordUrls.length})…`);
  }

  await ensureWordsets(wordUrls);
  onProgress(100, 'Offline ready');
}
