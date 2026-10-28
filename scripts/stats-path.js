/**
 * /stats and /api/stats treat a trailing slash as the same resource.
 * @param {string} pathname
 */
export function canonicalPath(pathname) {
  const p = String(pathname || '').replace(/\/+$/, '');
  return p || '/';
}

/**
 * @param {string} pathname
 */
export function isStatsPagePath(pathname) {
  return canonicalPath(pathname) === '/stats';
}

/**
 * @param {string} pathname
 */
export function isStatsApiPath(pathname) {
  return canonicalPath(pathname) === '/api/stats';
}

/**
 * Public locality aggregates for the home map (no IPs).
 * @param {string} pathname
 */
export function isStatsGeoApiPath(pathname) {
  return canonicalPath(pathname) === '/api/stats/geo';
}

/**
 * Routes the stats Worker owns. The local site proxies these and does not
 * implement them itself.
 * @param {string} pathname
 */
export function isStatsWorkerPath(pathname) {
  const p = canonicalPath(pathname);
  return (
    p === '/stats' ||
    p === '/api/stats' ||
    p === '/api/stats/geo' ||
    p === '/api/stats/import' ||
    p === '/api/plays' ||
    p === '/api/player' ||
    p === '/api/scoreboard' ||
    p === '/api/scoreboard/catalog'
  );
}
