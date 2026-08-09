/**
 * Load build-emitted compressed game wordsets.
 * Games never filter the master corpus at runtime.
 */

/**
 * @param {string} url
 * @returns {Promise<Uint8Array>}
 */
async function fetchBytes(url) {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * @param {Uint8Array} bytes
 */
async function gunzipJson(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream is required for compressed wordsets');
  }
  const ds = new DecompressionStream('gzip');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const text = await new Response(stream).text();
  return JSON.parse(text);
}

/**
 * @param {string} relPath path under /data/ e.g. games/polywordlot/en/5.json.gz
 */
export async function loadWordset(relPath) {
  const url = relPath.startsWith('/') ? relPath : `/data/${relPath.replace(/^data\//, '')}`;
  const bytes = await fetchBytes(url);
  return gunzipJson(bytes);
}

/**
 * Ensure URLs are cached by the service worker (best-effort).
 * @param {string[]} urls
 */
export async function ensureWordsets(urls) {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
    await Promise.all(urls.map((u) => fetch(u.startsWith('/') ? u : `/data/${u}`, { cache: 'reload' }).catch(() => null)));
    return;
  }
  navigator.serviceWorker.controller.postMessage({ type: 'cache-urls', urls: urls.map((u) => (u.startsWith('/') ? u : `/data/${u}`)) });
}
