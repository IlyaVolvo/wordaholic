/** Object key → UTC hour ISO, e.g. hours/2026-08-29T12:00:00.000Z.json */
export function hourFromObjectKey(key) {
  const match = String(key).match(/^hours\/(.+)\.json$/);
  return match ? match[1] : '';
}

export const HOUR_PULL_BATCH = 20;
export const HOUR_STORAGE_GET_BATCH = 128;
