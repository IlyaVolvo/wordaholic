/**
 * Fire-and-forget home and language counts. Drops on failure and offline.
 * A legacy games field is still accepted and ignored. Game starts are play reports.
 * @param {{
 *   homeHits?: number,
 *   languages?: Record<string, number>,
 *   games?: Record<string, Record<string, number>>,
 * }} delta
 */
export { reportPlayStart, reportPlayEnd, reportPlayVoid, browserId } from './plays.js';

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
