/**
 * Fire-and-forget stats delta. Drops on failure / offline.
 * @param {{
 *   homeHits?: number,
 *   languages?: Record<string, number>,
 *   games?: { polywordlot?: Record<string, number>, transword?: Record<string, number> },
 * }} delta
 */
export function reportStats(delta) {
  if (!delta || typeof delta !== 'object') return;
  try {
    void fetch('/api/stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(delta),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
