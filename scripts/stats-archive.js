import { closedHourFile, gcsConfigured, gcsHourObjectKey, putGcsObject } from './gcs-xml-put.js';

/**
 * Upload closed UTC hours to GCS. Empty hours are marked archived with no object.
 * Failed PUTs are left pending for the next alarm.
 *
 * @param {ReturnType<import('./stats-store.js').createStatsStore>} store
 * @param {{ GCS_BUCKET?: string, GCS_HMAC_ACCESS_KEY?: string, GCS_HMAC_SECRET?: string }} env
 * @param {number} [now]
 */
export async function archiveClosedHours(store, env, now = Date.now()) {
  if (!gcsConfigured(env)) return { configured: false, uploaded: [] };
  /** @type {string[]} */
  const uploaded = [];
  for (const { hour, ips } of store.pendingArchive(now)) {
    if (!Object.keys(ips).length) {
      store.markArchived(hour);
      continue;
    }
    try {
      await putGcsObject({
        accessKey: env.GCS_HMAC_ACCESS_KEY,
        secret: env.GCS_HMAC_SECRET,
        bucket: env.GCS_BUCKET,
        objectKey: gcsHourObjectKey(hour),
        body: closedHourFile(hour, ips),
      });
      store.markArchived(hour);
      uploaded.push(hour);
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
    }
  }
  return { configured: true, uploaded };
}
