/**
 * One-shot: GET /api/stats and PUT closed UTC hours to GCS.
 *
 *   GCS_BUCKET=… GCS_HMAC_ACCESS_KEY=… GCS_HMAC_SECRET=… node scripts/stats-push-gcs.js
 */
import { gcsConfigured } from './gcs-xml-put.js';
import { archiveClosedHours } from './stats-archive.js';
import { createStatsStore } from './stats-store.js';

const STATS_URL = process.env.STATS_URL || 'https://wordaholic.volvovski.com/api/stats';

const env = {
  GCS_BUCKET: process.env.GCS_BUCKET,
  GCS_HMAC_ACCESS_KEY: process.env.GCS_HMAC_ACCESS_KEY,
  GCS_HMAC_SECRET: process.env.GCS_HMAC_SECRET,
};

if (!gcsConfigured(env)) {
  console.error('Set GCS_BUCKET, GCS_HMAC_ACCESS_KEY, and GCS_HMAC_SECRET in the environment.');
  process.exit(1);
}

const res = await fetch(STATS_URL);
if (!res.ok) {
  console.error(`GET ${STATS_URL} ${res.status}`);
  process.exit(1);
}

const dump = await res.json();
const store = createStatsStore({ requireArchivedForPrune: true });
store.hydrate(dump);
const result = await archiveClosedHours(store, env);
console.log(JSON.stringify(result, null, 2));
if (result.uploaded.length === 0) {
  console.error('Nothing uploaded (current UTC hour is still open, or those hours were empty).');
}
