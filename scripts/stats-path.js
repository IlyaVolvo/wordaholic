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
 * Missing or questionable word reports. Not stored with stats.
 * @param {string} pathname
 */
export function isWordReportApiPath(pathname) {
  return canonicalPath(pathname) === '/api/word-report';
}
