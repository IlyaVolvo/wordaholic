/* Wordaholic service worker — cache shell + requested wordsets */
const CACHE_SHELL = 'wordaholic-shell-v64';
const CACHE_DATA = 'wordaholic-data-v4';

const PRECACHE = [
  '/',
  '/index.html',
  '/app.css',
  '/app/main.js',
  '/app/games-contract.js',
  '/app/storage/idb.js',
  '/app/storage/export-records.js',
  '/app/i18n-prefs/favorites.js',
  '/app/shell/languages.js',
  '/app/shell/map.js',
  '/app/shell/country-languages.js',
  '/app/shell/offline-prep.js',
  '/app/shell/update-ui.js',
  '/app/shell/author.js',
  '/app/shell/site-backup.js',
  '/app/shell/auto-export.js',
  '/app/help/topics.js',
  '/app/help/dialog.js',
  '/app/help/help.css',
  '/app/play/portrait-gate.css',
  '/app/play/portrait-gate.js',
  '/app/words/loader.js',
  '/app/updates/manifest.js',
  '/app/updates/reload-latest.js',
  '/app/stats/report.js',
  '/brand/wordaholic-mark.svg',
  '/site.webmanifest',
  '/deployment-manifest.json',
  '/data/languages.json',
  '/map/world.svg',
  '/games/polywordlot/index.html',
  '/games/transword/index.html',
  '/games/transword/game.js',
  '/games/transword/game.css',
  '/games/transword/graph.js',
  '/games/transword/solver.js',
  '/games/transword/dailyPuzzle.js',
  '/games/transword/daily-store.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_SHELL);
      for (const url of PRECACHE) {
        try {
          await cache.add(url);
        } catch {
          /* optional during partial builds */
        }
      }
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('wordaholic-') && k !== CACHE_SHELL && k !== CACHE_DATA)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'cache-urls' && Array.isArray(data.urls)) {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(CACHE_DATA);
        for (const url of data.urls) {
          try {
            await cache.add(url);
          } catch {
            /* ignore */
          }
        }
      })()
    );
  }
  if (data.type === 'activate-update') {
    event.waitUntil(self.skipWaiting());
  }
});

/**
 * Cache-first except the hash manifest. Reload should hit Cache Storage, not the network.
 * Navigations include ?lang= and often omit index.html; HEAD must reuse GET entries.
 */
async function matchFromCache(request) {
  const exact = await caches.match(request);
  if (exact) return exact;

  const url = new URL(request.url);

  if (request.method === 'HEAD') {
    const asGet = await caches.match(new Request(url.href, { method: 'GET' }));
    if (asGet) {
      return new Response(null, {
        status: asGet.status,
        statusText: asGet.statusText,
        headers: asGet.headers,
      });
    }
  }

  const isDocument = request.mode === 'navigate' || request.destination === 'document';
  if (isDocument) {
    let path = url.pathname;
    if (path.endsWith('/')) path += 'index.html';
    const indexHit = await caches.match(`${url.origin}${path}`);
    if (indexHit) return indexHit;
    const noSearch = await caches.match(request, { ignoreSearch: true });
    if (noSearch) return noSearch;
  }

  return caches.match(request, { ignoreSearch: true });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' && req.method !== 'HEAD') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (
    url.pathname === '/deployment-manifest.json' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/games/transword/admin')
  ) {
    event.respondWith(fetch(req, { cache: 'no-store' }).catch(() => matchFromCache(req)));
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await matchFromCache(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (
          req.method === 'GET' &&
          res.ok &&
          (url.pathname.startsWith('/data/') ||
            url.pathname.startsWith('/word-data/') ||
            url.pathname.startsWith('/games/') ||
            url.pathname.startsWith('/app/') ||
            url.pathname.startsWith('/help/'))
        ) {
          const cache = await caches.open(
            url.pathname.startsWith('/data/') || url.pathname.startsWith('/word-data/') ? CACHE_DATA : CACHE_SHELL
          );
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        if (req.mode === 'navigate') {
          const fallback = await caches.match('/index.html');
          if (fallback) return fallback;
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })()
  );
});
