import { getFavoriteLanguages } from '../i18n-prefs/favorites.js';
import { KNOWN_GAME_IDS, gameUrl, gameLanguagesUrl } from '../games-contract.js';
import siteHelp from '../help/site/topic.js';
import { ensureWordsets } from '../words/loader.js';

function siteHelpAssetUrls() {
  const urls = [];
  for (const step of siteHelp.steps || []) {
    if (step.image) urls.push(step.image);
    for (const layer of step.overlays || []) {
      if (layer?.src) urls.push(layer.src);
    }
  }
  return urls;
}

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
    '/app/help/site/topic.js',
    ...siteHelpAssetUrls(),
    ...KNOWN_GAME_IDS.map((id) => `${gameUrl(id)}help/topic.js`),
    '/app/play/portrait-gate.css',
    '/app/play/portrait-gate.js',
    '/app/play/header-chrome.css',
    '/app/play/header-chrome.js',
    '/deployment-manifest.json',
    '/app/announcements.json',
    '/data/languages.json',
    '/map/world.svg',
    ...KNOWN_GAME_IDS.map((id) => `${gameUrl(id)}index.html`),
    `${gameUrl('transword')}game.js`,
    `${gameUrl('transword')}game.css`,
    `${gameUrl('transword')}graph.js`,
    `${gameUrl('transword')}solver.js`,
    `${gameLanguagesUrl('transword')}index.json`,
  ];
  const bundledAssets = await Promise.all(
    ['polywordlot', 'polyhydra', 'letterix'].map((id) => assetUrlsFromIndex(`${gameUrl(id)}index.html`))
  );
  await Promise.all([...shellUrls, ...bundledAssets.flat()].map((u) => fetch(u).catch(() => null)));

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
          wordUrls.push(`${gameLanguagesUrl('polywordlot')}${dir}/answers-${len}.txt`);
          wordUrls.push(`${gameLanguagesUrl('polywordlot')}${dir}/dictionary-${len}.txt`);
        }
      }
    }
    if ((lang.games || []).includes('transword')) {
      const dir = lang.transwordDir;
      if (dir) {
        wordUrls.push(`${gameLanguagesUrl('transword')}${dir}/corpus.txt`);
      }
    }
    if ((lang.games || []).includes('letterix') && lang.letterixDir) {
      wordUrls.push(`${gameLanguagesUrl('letterix')}${lang.letterixDir}/corpus.txt`);
      wordUrls.push(`${gameLanguagesUrl('letterix')}${lang.letterixDir}/corpus2.txt`);
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
